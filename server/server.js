/**
 * ─────────────────────────────────────────────────────────────────────────
 *  БЭКЕНД ЗАКАЗОВ: SQLite + Telegram
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Принимает заказ (POST /api/order), сохраняет его в файловую базу SQLite
 *  (orders.db) и пересылает в Telegram. Возвращает сайту номер заказа.
 *  Отдаёт статус заказа по номеру (GET /api/order/<id>) — для страницы
 *  «Мои заказы» у покупателя.
 *
 *  Требуется Node.js 22+ (используется встроенный модуль node:sqlite —
 *  устанавливать и собирать ничего не нужно). Внешних зависимостей нет.
 *
 *  Запуск:
 *      cp .env.example .env   # заполнить токен/чат/домен
 *      node server.js
 * ─────────────────────────────────────────────────────────────────────────
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, createHash } from 'node:crypto'
import { postJsonWithRetry } from './notify.js'
import { safeTokenEqual, createRateLimiter, createAttemptThrottle } from './security.js'
import {
  validateProduct,
  rowToApiProduct,
  productToColumns,
  sniffImageType,
  IMAGE_EXT,
} from './products.js'
import {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
  sessionVersion,
  signSession,
  verifySession,
  parseCookies,
  normalizeEmail,
  isValidEmail,
  isValidPassword,
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── загрузка .env (без внешних пакетов) ──
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (m && !line.trim().startsWith('#')) {
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!(m[1] in process.env)) process.env[m[1]] = val
    }
  }
} catch {}

const PORT = process.env.PORT || 8787
const TOKEN = process.env.TG_BOT_TOKEN
const CHAT_ID = process.env.TG_CHAT_ID
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'
const ALLOWED_LIST = ALLOWED_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'orders.db')
const MAX_BODY = 64 * 1024
// Каталог загруженных в админке фото товаров. Отдельный том (см. docker-compose),
// nginx раздаёт его как /media/. Держим вне образа и вне БД с ПДн.
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media')
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGES_PER_PRODUCT = 12
// Секрет для админки. Если не задан — админ-эндпоинты выключены.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
// ── Личный кабинет (аккаунты покупателей) ──
// Секрет подписи сессионных кук. В проде задайте SESSION_SECRET явно (иначе при
// перезапуске все сессии инвалидируются). Порядок фолбэка: явный секрет →
// производный от ADMIN_TOKEN (стабилен между перезапусками) → случайный на процесс
// (только для dev; после рестарта разлогинит). Предупреждаем, если секрет не задан.
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (ADMIN_TOKEN ? createHash('sha256').update(`aqualine:${ADMIN_TOKEN}`).digest('hex') : '') ||
  randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET && !ADMIN_TOKEN) {
  console.warn(
    'ВНИМАНИЕ: SESSION_SECRET не задан — сессии кабинета не переживут перезапуск. Задайте SESSION_SECRET в .env для прода.',
  )
}
const COOKIE_NAME = 'aq_session'
const SESSION_TTL_MS = 30 * 86_400_000 // 30 дней
// Secure-флаг куки: включаем в проде (за HTTPS). COOKIE_SECURE=1 в server/.env.
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1'
const EMAIL_MAX = 254
const STATUSES = ['new', 'confirmed', 'done', 'cancelled']
// Бронь считается активной (её можно продлить/отменить) в этих статусах.
const ACTIVE_STATUSES = ['new', 'confirmed']
// Срок хранения брони по умолчанию (дни) — держите в синхроне с HOLD_DAYS в
// src/store.js и public/admin.js. От него считается hold_until новых заказов.
const HOLD_DAYS = 2
const DAY_MS = 86_400_000
// Максимальный сдвиг срока за один запрос и абсолютный потолок (защита от опечаток).
const EXTEND_MAX_DAYS = 30
const EXTEND_CAP_MS = 90 * DAY_MS
// Объявление-баннер: предельная длина текста и допустимые уровни (влияют на цвет
// плашки на сайте). Всё, что вне списка, приводим к 'info'.
const ANNOUNCE_MSG_MAX = 300
const ANNOUNCE_LEVELS = ['info', 'warn']
// Управляющие C0/DEL-байты (кроме \t \n \r) — вырезаем из текста объявления,
// чтобы в баннер не попал невидимый мусор. Класс намеренно содержит контролы.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

if (!TOKEN || !CHAT_ID) {
  console.error('Ошибка: задайте TG_BOT_TOKEN и TG_CHAT_ID в .env')
  process.exit(1)
}

// ── База данных ──
const db = new DatabaseSync(DB_PATH)
// WAL: писатель не блокирует читателей и наоборот; busy_timeout вместо мгновенной
// ошибки «database is locked» при пересечении INSERT и досылки; synchronous=NORMAL
// — безопасный компромисс для WAL. Файлы -wal/-shm живут рядом с БД (том /data).
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`)
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name       TEXT,
    phone      TEXT,
    payment    TEXT,
    comment    TEXT,
    items      TEXT,
    total      INTEGER,
    status     TEXT NOT NULL DEFAULT 'new',
    notified   INTEGER NOT NULL DEFAULT 0,
    hold_until TEXT
  )
`)
// Миграция для БД, созданных до появления колонки notified (флаг успешной
// отправки в Telegram). ALTER на уже существующей колонке бросит ошибку —
// ловим и пропускаем. Уже имеющиеся заказы помечаем уведомлёнными, чтобы
// досылка не отправляла их задним числом.
try {
  db.exec('ALTER TABLE orders ADD COLUMN notified INTEGER NOT NULL DEFAULT 0')
  db.exec('UPDATE orders SET notified = 1')
  console.log('Миграция БД: добавлена колонка notified (старые заказы помечены уведомлёнными)')
} catch {
  // колонка уже есть — миграция не нужна
}
// Миграция для БД без колонки hold_until (срок хранения брони). Существующим
// заказам проставляем срок = created_at + HOLD_DAYS, чтобы просрочка и продление
// считались одинаково для старых и новых записей.
try {
  db.exec('ALTER TABLE orders ADD COLUMN hold_until TEXT')
  // strftime с суффиксом Z — валидный UTC-ISO (datetime() дал бы строку без Z,
  // и JS распарсил бы её как локальное время).
  db.exec(
    `UPDATE orders SET hold_until = strftime('%Y-%m-%dT%H:%M:%SZ', created_at, '+${HOLD_DAYS} days') WHERE hold_until IS NULL`,
  )
  console.log(
    `Миграция БД: добавлена колонка hold_until (старым заказам проставлен срок +${HOLD_DAYS} дн.)`,
  )
} catch {
  // колонка уже есть — миграция не нужна
}
// Индексы: список в админке (ORDER BY created_at) и выборка досылки
// (WHERE notified=0 AND created_at BETWEEN) иначе делают полное сканирование —
// таблица только растёт (заказы не удаляются).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_notified_created ON orders(notified, created_at);
`)
// ── Аккаунты покупателей (личный кабинет) ──
// Заказ связывается с аккаунтом через orders.user_id (NULL у гостевых броней —
// гостевой сценарий остаётся основным и ничем не ограничен). Внешний ключ через
// ALTER добавить нельзя (ограничение SQLite), целостность держим на уровне кода.
try {
  db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER')
  console.log('Миграция БД: добавлена колонка orders.user_id (связь брони с аккаунтом)')
} catch {
  // колонка уже есть — миграция не нужна
}
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    name       TEXT,
    phone      TEXT,
    created_at TEXT NOT NULL
  )
`)
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)')
const insertUserStmt = db.prepare(
  'INSERT INTO users (email, password, name, phone, created_at) VALUES (?, ?, ?, ?, ?)',
)
const getUserByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?')
const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?')
const updateProfileStmt = db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
const updatePasswordStmt = db.prepare('UPDATE users SET password = ? WHERE id = ?')
// Заказы аккаунта — те же поля, что видит покупатель в «Мои брони».
const listOrdersByUserStmt = db.prepare(
  'SELECT id, created_at, payment, items, total, status, hold_until FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
)
// Настройки магазина — key/value. Пока тут только объявление-баннер (announcement):
// владелец включает/меняет его в админке, а сайт показывает всем посетителям.
// Отдельная таблица, чтобы не смешивать конфиг с заказами.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)
const getSettingStmt = db.prepare('SELECT value, updated_at FROM settings WHERE key = ?')
const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

// Каталог товаров. Источник правды для витрины: сайт читает GET /api/products,
// админка правит записи. images/specs/related хранятся как JSON-строки.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT,
    name        TEXT NOT NULL,
    category    TEXT,
    brand       TEXT,
    price       INTEGER NOT NULL DEFAULT 0,
    old_price   INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    images      TEXT,
    specs       TEXT,
    related     TEXT,
    in_stock    INTEGER NOT NULL DEFAULT 1,
    clearance   INTEGER NOT NULL DEFAULT 0
  )
`)
db.exec('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)')
const listProductsStmt = db.prepare('SELECT * FROM products ORDER BY id ASC')
const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?')
const insertProductStmt = db.prepare(`
  INSERT INTO products (sku, name, category, brand, price, old_price, description, images, specs, related, in_stock, clearance)
  VALUES (@sku, @name, @category, @brand, @price, @old_price, @description, @images, @specs, @related, @in_stock, @clearance)
`)
// Тот же INSERT, но с явным id — для сида (сохраняем id из таблицы, чтобы
// related-ссылки и ссылки /product/:id остались валидными).
const insertProductWithIdStmt = db.prepare(`
  INSERT INTO products (id, sku, name, category, brand, price, old_price, description, images, specs, related, in_stock, clearance)
  VALUES (@id, @sku, @name, @category, @brand, @price, @old_price, @description, @images, @specs, @related, @in_stock, @clearance)
`)
const updateProductStmt = db.prepare(`
  UPDATE products SET sku=@sku, name=@name, category=@category, brand=@brand, price=@price,
    old_price=@old_price, description=@description, images=@images, specs=@specs,
    related=@related, in_stock=@in_stock, clearance=@clearance WHERE id=@id
`)
const deleteProductStmt = db.prepare('DELETE FROM products WHERE id = ?')
const countProductsStmt = db.prepare('SELECT COUNT(*) AS n FROM products')
const updateImagesStmt = db.prepare('UPDATE products SET images = ? WHERE id = ?')

// Разовый посев каталога из seed-products.json, только если таблица пуста. После
// первого запуска источник правды — БД (её правит админка). Сохраняем id из сида.
function seedProductsIfEmpty() {
  if (countProductsStmt.get().n > 0) return
  let seed
  try {
    seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-products.json'), 'utf8'))
  } catch {
    return
  }
  const list = Array.isArray(seed?.products) ? seed.products : []
  let n = 0
  for (const p of list) {
    const { value } = validateProduct(p)
    if (!value) continue
    const cols = productToColumns(value)
    if (Number.isInteger(p.id) && p.id > 0) insertProductWithIdStmt.run({ id: p.id, ...cols })
    else insertProductStmt.run(cols)
    n++
  }
  if (n) console.log(`Посев каталога: добавлено товаров ${n} из seed-products.json`)
}
seedProductsIfEmpty()

// Каталог загруженных фото — вне образа (том). Создаём, если ещё нет.
try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
} catch {
  // не критично: при первом аплоаде попробуем снова
}
const insertStmt = db.prepare(`
  INSERT INTO orders (id, created_at, name, phone, payment, comment, items, total, status, hold_until, user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
`)
const getStmt = db.prepare(
  'SELECT id, created_at, total, status, hold_until FROM orders WHERE id = ?',
)
// Статус + срок хранения — для продления брони админом.
const getHoldStmt = db.prepare('SELECT status, hold_until FROM orders WHERE id = ?')
// Продлеваем срок только у активной брони (иначе продление отменённой/выполненной
// не имеет смысла) — атомарно, WHERE по статусу.
const extendStmt = db.prepare(
  "UPDATE orders SET hold_until = ? WHERE id = ? AND status IN ('new', 'confirmed')",
)
const existsStmt = db.prepare('SELECT 1 FROM orders WHERE id = ?')
const listStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500')
const updateStatusStmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?')
// Статус + телефон по номеру — для клиентской отмены (сверяем телефон).
const getStatusPhoneStmt = db.prepare('SELECT status, phone FROM orders WHERE id = ?')
// Атомарная отмена: переводим в cancelled только если бронь ещё активна —
// закрывает гонку с менеджером (read-modify-write без транзакции).
const cancelActiveStmt = db.prepare(
  "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN ('new', 'confirmed')",
)
// Лёгкая проверка живости БД для /api/health.
const healthStmt = db.prepare('SELECT 1 AS ok')
const markNotifiedStmt = db.prepare('UPDATE orders SET notified = 1 WHERE id = ?')
// Неотправленные уведомления для досылки: не трогаем совсем свежие (у них ещё
// идёт первичная попытка с ретраями) и слишком старые (их уже видно в админке).
const pendingNotifyStmt = db.prepare(`
  SELECT id, name, phone, payment, comment, items, total
  FROM orders
  WHERE notified = 0 AND created_at <= ? AND created_at >= ?
  ORDER BY created_at ASC
  LIMIT ?
`)

// Дата для номера — по московскому времени (через Intl, без tzdata в контейнере):
// иначе поздним вечером МСК при UTC-контейнере номер получал бы «вчерашнюю» дату.
const ymdParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
})
function moscowYmd() {
  const p = Object.fromEntries(ymdParts.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}`
}
// Номер брони AQ-YYMMDD-NNNNNN. Хвост — 6 крипто-случайных цифр (900k вариантов
// вместо 9k у Math.random): труднее перебрать (см. rate-limit на /cancel).
function newOrderId() {
  const ymd = moscowYmd()
  for (let i = 0; i < 30; i++) {
    const id = `AQ-${ymd}-${randomInt(100000, 1000000)}`
    if (!existsStmt.get(id)) return id
  }
  // Фолбэк сохраняет формат (уникальность и так гарантирует PRIMARY KEY).
  return `AQ-${ymd}-${randomInt(100000, 1000000)}`
}

// ── Telegram ──
const PAYMENT = { card: 'Картой при получении', cash: 'Наличными' }
const rub = (v) => new Intl.NumberFormat('ru-RU').format(v) + ' \u20bd'

function buildMessage(id, order) {
  const c = order.customer || {}
  const lines = [
    `\u{1F6C1} Новая бронь ${id}`,
    '',
    `Клиент: ${c.name || '\u2014'}`,
    `Телефон: ${c.phone || '\u2014'}`,
    `Оплата: ${PAYMENT[c.payment] || c.payment || '\u2014'}`,
  ]
  if (c.comment && c.comment.trim()) lines.push(`Комментарий: ${c.comment.trim()}`)
  lines.push('', 'Товары:')
  for (const it of order.items || []) {
    lines.push(`\u2022 ${it.name} (${it.sku}) \u00d7 ${it.qty} \u2014 ${rub(it.price * it.qty)}`)
  }
  lines.push('', `Итого: ${rub(order.total || 0)}`)
  return lines.join('\n')
}

async function notifyTelegram(id, order) {
  const result = await postJsonWithRetry({
    url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    body: JSON.stringify({ chat_id: CHAT_ID, text: buildMessage(id, order) }),
  })
  if (result.ok) {
    // Помечаем заказ уведомлённым, чтобы досылка его больше не трогала.
    try {
      markNotifiedStmt.run(id)
    } catch (e) {
      console.error(`Не удалось отметить заказ ${id} как уведомлённый:`, e)
    }
  } else {
    console.error(
      `Не удалось отправить заказ ${id} в Telegram после ${result.attempts} попыток (заказ сохранён, будет досылка).`,
    )
  }
  return result.ok
}

// Уведомление менеджера об отмене брони клиентом (best-effort, не блокирует ответ).
function notifyCancel(id, phone) {
  if (!TOKEN || !CHAT_ID) return
  postJsonWithRetry({
    url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `❌ Клиент отменил бронь ${id} (тел. ${phone}). Снимите товар с резерва.`,
    }),
  }).catch(() => {})
}

// ── Досылка неотправленных уведомлений ──
// Если в момент заказа Telegram был недоступен (нет интернета у сервера,
// блокировка, таймаут), уведомление остаётся notified=0. Периодически
// пробуем разослать такие — заказ при этом уже давно сохранён в БД.
const RESEND_MIN_AGE_MS = 60_000 // не трогаем заказы свежее минуты — у них ещё идёт первичная попытка
const RESEND_MAX_AGE_MS = 3 * 24 * 60 * 60_000 // старше 3 суток не досылаем (их уже видно в админке)
const RESEND_INTERVAL_MS = 5 * 60_000 // как часто проверять
const RESEND_BATCH = 10 // максимум за один проход — не флудим Telegram

async function resendPending() {
  const now = Date.now()
  const upper = new Date(now - RESEND_MIN_AGE_MS).toISOString()
  const lower = new Date(now - RESEND_MAX_AGE_MS).toISOString()
  let rows
  try {
    rows = pendingNotifyStmt.all(upper, lower, RESEND_BATCH)
  } catch (e) {
    return console.error('Досылка: ошибка выборки из БД:', e)
  }
  if (!rows.length) return
  console.log(`Досылка уведомлений: пробуем отправить ${rows.length}…`)
  for (const r of rows) {
    let items
    try {
      items = JSON.parse(r.items || '[]')
    } catch (e) {
      // Битый JSON одной записи не должен ронять весь проход (async-таймер →
      // unhandledRejection). Пропускаем, помечаем уведомлённой, чтобы не зациклиться.
      console.error(`Досылка: битый items у заказа ${r.id}, пропускаю:`, e)
      try {
        markNotifiedStmt.run(r.id)
      } catch {}
      continue
    }
    const order = {
      customer: { name: r.name, phone: r.phone, payment: r.payment, comment: r.comment },
      items,
      total: r.total,
    }
    await notifyTelegram(r.id, order) // сам пометит notified=1 при успехе
  }
}

// ── Валидация ──
// Верхние границы длины строк: не даём записать в БД и вставить в сообщение
// менеджеру произвольно длинный текст (MAX_BODY 64KB — слишком грубый предел).
const NAME_MAX = 200
const SKU_MAX = 64
const COMMENT_MAX = 2000
function validate(order) {
  if (!order || typeof order !== 'object') return 'bad-payload'
  const c = order.customer
  const name = typeof c?.name === 'string' ? c.name.trim() : ''
  if (name.length < 2 || name.length > NAME_MAX) return 'bad-name'
  const phoneDigits = typeof c?.phone === 'string' ? c.phone.replace(/\D/g, '') : ''
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return 'bad-phone'
  if (!Array.isArray(order.items) || order.items.length === 0) return 'empty-cart'
  if (order.items.length > 200) return 'too-many-items'
  // Проверяем форму каждой позиции — иначе мусор уходит в БД и в Telegram.
  for (const it of order.items) {
    if (!it || typeof it !== 'object') return 'bad-item'
    if (typeof it.name !== 'string' || it.name.trim().length === 0) return 'bad-item'
    if (it.name.trim().length > NAME_MAX) return 'bad-item'
    if (it.sku != null && (typeof it.sku !== 'string' || it.sku.length > SKU_MAX)) return 'bad-item'
    if (!Number.isFinite(it.price) || it.price < 0) return 'bad-item'
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 1000) return 'bad-item'
  }
  return null
}

// Итог считаем на сервере из позиций — клиентскому order.total не доверяем
// (иначе можно забронировать «товар за 1 ₽»).
function computeTotal(items) {
  return items.reduce((sum, it) => sum + it.price * it.qty, 0)
}

// Текущее объявление из настроек. Возвращаем нормализованный объект, даже если
// записи ещё нет (active:false). updatedAt служит «версией» — по нему сайт
// понимает, что объявление сменилось, и снова показывает закрытую ранее плашку.
function readAnnouncement() {
  const row = getSettingStmt.get('announcement')
  if (!row) return { active: false, message: '', level: 'info', updatedAt: null }
  let val = {}
  try {
    val = JSON.parse(row.value) || {}
  } catch {
    val = {}
  }
  return {
    active: Boolean(val.active),
    message: typeof val.message === 'string' ? val.message : '',
    level: ANNOUNCE_LEVELS.includes(val.level) ? val.level : 'info',
    updatedAt: row.updated_at,
  }
}

// ── HTTP ──
function setCors(res, reqOrigin) {
  let allow = ''
  if (ALLOWED_LIST.includes('*')) allow = '*'
  else if (reqOrigin && ALLOWED_LIST.includes(reqOrigin)) allow = reqOrigin
  else allow = ALLOWED_LIST[0] || '*'
  res.setHeader('Access-Control-Allow-Origin', allow)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token')
  res.setHeader('Vary', 'Origin')
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}
// Сбор тела запроса в строку с лимитом. cb(raw) вызывается по завершении.
function readBody(req, cb, max = MAX_BODY) {
  let raw = ''
  req.on('data', (c) => {
    raw += c
    if (raw.length > max) req.destroy()
  })
  req.on('end', () => cb(raw))
}
// Сбор бинарного тела (аплоад фото) в Buffer с лимитом.
function readBuffer(req, cb, max) {
  const chunks = []
  let size = 0
  req.on('data', (c) => {
    size += c.length
    if (size > max) return req.destroy()
    chunks.push(c)
  })
  req.on('end', () => cb(Buffer.concat(chunks)))
}
// Разбор JSON-массива ссылок на фото из колонки images.
function safeParseImages(sJson) {
  try {
    const v = JSON.parse(sJson || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
// Удаление локального файла фото (только из MEDIA_DIR, с защитой от обхода пути).
function unlinkMedia(url) {
  const s = String(url || '')
  if (!s.startsWith('/media/')) return
  const name = path.basename(s)
  const full = path.join(MEDIA_DIR, name)
  // Финальная проверка: путь не должен вырваться из MEDIA_DIR.
  if (path.dirname(full) !== path.resolve(MEDIA_DIR)) return
  try {
    fs.unlinkSync(full)
  } catch {
    // файла уже нет — ок
  }
}

// Лимит заказов: не более 20 с одного IP за минуту — пропускает любого живого
// покупателя, но режет спам, который иначе забил бы БД и зафлудил Telegram.
// Предел настраивается (RL_MAX) — например, чтобы поднять в тестах.
const RL_MAX = Number(process.env.RL_MAX) || 20
const orderLimiter = createRateLimiter({ max: RL_MAX, windowMs: 60_000 })
// Отдельные лимиты: отмена (перебор хвоста номера брони) и админка.
const cancelLimiter = createRateLimiter({
  max: Number(process.env.RL_CANCEL_MAX) || 10,
  windowMs: 60_000,
})
const adminLimiter = createRateLimiter({
  max: Number(process.env.RL_ADMIN_MAX) || 60,
  windowMs: 60_000,
})
// Чтение статуса тоже лимитируем: номер брони угадываем (AQ-YYMMDD-NNNNNN), а без
// лимита эндпоинт статуса можно перебрать и собрать суммы/статусы всех броней.
// Порог выше отмены — «Мои брони» опрашивает статусы пачкой (Promise.all по всем
// броням клиента), поэтому берём с запасом на легальный всплеск.
const statusLimiter = createRateLimiter({
  max: Number(process.env.RL_STATUS_MAX) || 120,
  windowMs: 60_000,
})
// Авторизация: лимит по IP (регистрация/логин/смена пароля) + блокировка по email
// при переборе пароля (не обходится сменой IP).
const authLimiter = createRateLimiter({
  max: Number(process.env.RL_AUTH_MAX) || 20,
  windowMs: 60_000,
})
const loginThrottle = createAttemptThrottle({
  maxFails: Number(process.env.LOGIN_MAX_FAILS) || 5,
})
// Реальный IP клиента. За nginx берём X-Real-IP ($remote_addr — nginx его
// ПЕРЕЗАПИСЫВАЕТ, клиент подделать не может). X-Forwarded-For нельзя брать как
// [0]: nginx ($proxy_add_x_forwarded_for) дописывает реальный IP в КОНЕЦ, а
// первый элемент прислал клиент — иначе rate-limit обходится случайным XFF.
const clientIp = (req) => {
  const real = req.headers['x-real-ip']
  if (real) return String(real).trim()
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',').pop().trim()
  return req.socket.remoteAddress || 'unknown'
}

// ── Сессии кабинета ──
function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (COOKIE_SECURE) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}
function clearSessionCookie(res) {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0']
  if (COOKIE_SECURE) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}
// Текущий пользователь по сессионной куке или null. Помимо подписи и срока
// проверяем sv: если он не совпадает с текущим паролем (пароль сменили) —
// сессия недействительна. Возвращает строку из users или null.
function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  const data = verifySession(SESSION_SECRET, token)
  if (!data) return null
  const user = getUserByIdStmt.get(data.uid)
  if (!user) return null
  if (data.sv !== sessionVersion(SESSION_SECRET, user.password)) return null
  return user
}
// Публичная проекция пользователя (без хеша пароля) — для ответов API.
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name || '', phone: u.phone || '' })

const server = http.createServer((req, res) => {
  setCors(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    // Проверяем и доступность БД — иначе healthcheck зелёный при залоченной/битой
    // базе, и Docker не перезапустит контейнер, хотя заказы не пишутся.
    try {
      healthStmt.get()
      return json(res, 200, { ok: true })
    } catch {
      return json(res, 503, { ok: false, error: 'db-error' })
    }
  }

  // Публичное объявление-баннер: GET /api/announcement. Наружу отдаём только
  // включённое и непустое — выключенный «черновик» не светим. updatedAt нужен
  // сайту как версия (сброс закрытия плашки при смене текста).
  if (req.method === 'GET' && req.url === '/api/announcement') {
    const a = readAnnouncement()
    if (!a.active || !a.message.trim()) return json(res, 200, { ok: true, active: false })
    return json(res, 200, {
      ok: true,
      active: true,
      message: a.message,
      level: a.level,
      updatedAt: a.updatedAt,
    })
  }

  // Публичный каталог для витрины: GET /api/products → { products, categories }.
  // Первичный источник каталога сайта (см. src/catalog.js loadFromApi).
  if (req.method === 'GET' && req.url === '/api/products') {
    const products = listProductsStmt.all().map(rowToApiProduct)
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))]
    return json(res, 200, { ok: true, products, categories })
  }

  // ── Личный кабинет: аккаунты покупателей (email + пароль) ──
  // Регистрация: POST /api/auth/register { email, password, name?, phone? }
  if (req.method === 'POST' && req.url === '/api/auth/register') {
    const rl = authLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const email = normalizeEmail(body.email)
      if (!isValidEmail(email)) return json(res, 400, { ok: false, error: 'bad-email' })
      if (!isValidPassword(body.password))
        return json(res, 400, { ok: false, error: 'bad-password' })
      if (getUserByEmailStmt.get(email)) return json(res, 409, { ok: false, error: 'email-taken' })
      const name = String(body.name || '')
        .trim()
        .slice(0, NAME_MAX)
      const phone = String(body.phone || '')
        .trim()
        .slice(0, 32)
      const password = hashPassword(body.password)
      let info
      try {
        info = insertUserStmt.run(email, password, name, phone, new Date().toISOString())
      } catch {
        // редкая гонка на UNIQUE(email) между проверкой и вставкой
        return json(res, 409, { ok: false, error: 'email-taken' })
      }
      const uid = Number(info.lastInsertRowid)
      setSessionCookie(res, signSession(SESSION_SECRET, uid, password, SESSION_TTL_MS))
      return json(res, 200, { ok: true, user: publicUser(getUserByIdStmt.get(uid)) })
    })
  }

  // Вход: POST /api/auth/login { email, password }
  if (req.method === 'POST' && req.url === '/api/auth/login') {
    const rl = authLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const email = normalizeEmail(body.email)
      // Блокировка по email при переборе (не обходится сменой IP).
      const th = loginThrottle.check(email)
      if (!th.allowed) {
        res.setHeader('Retry-After', String(th.retryAfter))
        return json(res, 429, { ok: false, error: 'too-many-attempts' })
      }
      const user = getUserByEmailStmt.get(email)
      // По несуществующему email всё равно прогоняем scrypt (равное время ответа).
      const ok = user
        ? verifyPassword(body.password, user.password)
        : (verifyPassword(body.password, DUMMY_PASSWORD_HASH), false)
      if (!ok) {
        loginThrottle.fail(email)
        return json(res, 401, { ok: false, error: 'bad-credentials' })
      }
      loginThrottle.reset(email)
      setSessionCookie(res, signSession(SESSION_SECRET, user.id, user.password, SESSION_TTL_MS))
      return json(res, 200, { ok: true, user: publicUser(user) })
    })
  }

  // Выход: POST /api/auth/logout
  if (req.method === 'POST' && req.url === '/api/auth/logout') {
    clearSessionCookie(res)
    return json(res, 200, { ok: true })
  }

  // Текущий пользователь: GET /api/auth/me
  if (req.method === 'GET' && req.url === '/api/auth/me') {
    const user = currentUser(req)
    if (!user) return json(res, 200, { ok: false })
    return json(res, 200, { ok: true, user: publicUser(user) })
  }

  // Обновление профиля: POST /api/auth/profile { name?, phone? } (email неизменяем)
  if (req.method === 'POST' && req.url === '/api/auth/profile') {
    const user = currentUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'unauthorized' })
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const name =
        body.name === undefined ? user.name || '' : String(body.name).trim().slice(0, NAME_MAX)
      const phone =
        body.phone === undefined ? user.phone || '' : String(body.phone).trim().slice(0, 32)
      updateProfileStmt.run(name, phone, user.id)
      return json(res, 200, { ok: true, user: publicUser(getUserByIdStmt.get(user.id)) })
    })
  }

  // Смена пароля: POST /api/auth/password { current, next }
  if (req.method === 'POST' && req.url === '/api/auth/password') {
    const rl = authLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    const user = currentUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'unauthorized' })
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      if (!verifyPassword(body.current, user.password))
        return json(res, 403, { ok: false, error: 'bad-current' })
      if (!isValidPassword(body.next)) return json(res, 400, { ok: false, error: 'bad-password' })
      const next = hashPassword(body.next)
      updatePasswordStmt.run(next, user.id)
      // Пароль сменился → sv изменился, старые куки мертвы. Переиздаём куку этой
      // сессии с новым sv, чтобы текущее устройство не разлогинилось.
      setSessionCookie(res, signSession(SESSION_SECRET, user.id, next, SESSION_TTL_MS))
      return json(res, 200, { ok: true })
    })
  }

  // Заказы аккаунта: GET /api/orders (только для вошедших; гость — 401).
  if (req.method === 'GET' && req.url === '/api/orders') {
    const user = currentUser(req)
    if (!user) return json(res, 401, { ok: false, error: 'unauthorized' })
    const orders = listOrdersByUserStmt.all(user.id).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      payment: r.payment,
      items: JSON.parse(r.items || '[]'),
      total: r.total,
      status: r.status,
      holdUntil: r.hold_until,
    }))
    return json(res, 200, { ok: true, orders })
  }

  // Статус заказа по номеру: GET /api/order/AQ-...
  const statusMatch = req.method === 'GET' && req.url.match(/^\/api\/order\/([\w-]+)$/)
  if (statusMatch) {
    const rl = statusLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    const row = getStmt.get(decodeURIComponent(statusMatch[1]))
    if (!row) return json(res, 404, { ok: false, error: 'not-found' })
    return json(res, 200, {
      ok: true,
      id: row.id,
      status: row.status,
      total: row.total,
      createdAt: row.created_at,
      holdUntil: row.hold_until,
    })
  }

  // Отмена брони клиентом: POST /api/order/<id>/cancel  { phone }
  // Номер брони перебираем (AQ-YYMMDD-NNNN), поэтому требуем совпадение
  // телефона — он есть у клиента на устройстве, но не у постороннего.
  const cancelMatch = req.method === 'POST' && req.url.match(/^\/api\/order\/([\w-]+)\/cancel$/)
  if (cancelMatch) {
    const rl = cancelLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    const id = decodeURIComponent(cancelMatch[1])
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const row = getStatusPhoneStmt.get(id)
      if (!row) return json(res, 404, { ok: false, error: 'not-found' })
      const digits = (s) => String(s || '').replace(/\D/g, '')
      if (!body.phone || digits(body.phone) !== digits(row.phone)) {
        return json(res, 403, { ok: false, error: 'phone-mismatch' })
      }
      // Отменяем атомарно: UPDATE ... WHERE status IN (new, confirmed). Если
      // между чтением и записью менеджер сменил статус — changes=0, и мы отдаём
      // актуальный статус (не затираем выполненную бронь отменой).
      const info = cancelActiveStmt.run(id)
      if (info.changes === 0) {
        const cur = getStatusPhoneStmt.get(id)
        return json(res, 409, { ok: false, error: 'not-cancellable', status: cur?.status })
      }
      notifyCancel(id, row.phone)
      return json(res, 200, { ok: true, id, status: 'cancelled' })
    })
    return
  }

  // ── Админка (защищена токеном ADMIN_TOKEN) ──
  const isAdmin =
    Boolean(ADMIN_TOKEN) && safeTokenEqual(req.headers['x-admin-token'] || '', ADMIN_TOKEN)

  if (
    req.url === '/api/admin/orders' ||
    req.url === '/api/admin/announcement' ||
    req.url === '/api/admin/products' ||
    /^\/api\/admin\/order\//.test(req.url) ||
    /^\/api\/admin\/product\b/.test(req.url)
  ) {
    const rl = adminLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    if (!ADMIN_TOKEN) return json(res, 503, { ok: false, error: 'admin-disabled' })
    if (!isAdmin) return json(res, 401, { ok: false, error: 'unauthorized' })
  }

  // Объявление в админке: GET — текущее (в т.ч. выключенный черновик, для формы).
  if (req.method === 'GET' && req.url === '/api/admin/announcement') {
    return json(res, 200, { ok: true, ...readAnnouncement() })
  }

  // POST — сохранить/включить/выключить: { active, message, level }.
  if (req.method === 'POST' && req.url === '/api/admin/announcement') {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const active = Boolean(body.active)
      const level = ANNOUNCE_LEVELS.includes(body.level) ? body.level : 'info'
      // Режем управляющие символы (кроме перевода строки/таба) и лишние пробелы —
      // текст показывается как есть в баннере.
      let message =
        typeof body.message === 'string' ? body.message.replace(CONTROL_CHARS_RE, '').trim() : ''
      if (message.length > ANNOUNCE_MSG_MAX) return json(res, 400, { ok: false, error: 'too-long' })
      // Включать пустое объявление бессмысленно — на сайте была бы пустая плашка.
      if (active && !message) return json(res, 400, { ok: false, error: 'empty-message' })
      const updatedAt = new Date().toISOString()
      setSettingStmt.run('announcement', JSON.stringify({ active, message, level }), updatedAt)
      return json(res, 200, { ok: true, active, message, level, updatedAt })
    })
    return
  }

  // ── Товары (админка) ──
  if (req.method === 'GET' && req.url === '/api/admin/products') {
    return json(res, 200, { ok: true, products: listProductsStmt.all().map(rowToApiProduct) })
  }

  if (req.method === 'POST' && req.url === '/api/admin/product/create') {
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const { error, value } = validateProduct(body)
      if (error) return json(res, 400, { ok: false, error })
      const info = insertProductStmt.run(productToColumns(value))
      const row = getProductStmt.get(Number(info.lastInsertRowid))
      return json(res, 200, { ok: true, product: rowToApiProduct(row) })
    })
  }

  if (req.method === 'POST' && req.url === '/api/admin/product/update') {
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const id = Number(body.id)
      if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: 'bad-id' })
      if (!getProductStmt.get(id)) return json(res, 404, { ok: false, error: 'not-found' })
      const { error, value } = validateProduct(body)
      if (error) return json(res, 400, { ok: false, error })
      updateProductStmt.run({ id, ...productToColumns(value) })
      return json(res, 200, { ok: true, product: rowToApiProduct(getProductStmt.get(id)) })
    })
  }

  if (req.method === 'POST' && req.url === '/api/admin/product/delete') {
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const row = getProductStmt.get(Number(body.id))
      if (!row) return json(res, 404, { ok: false, error: 'not-found' })
      // Подчищаем локальные файлы фото товара, чтобы не копить сирот.
      for (const url of safeParseImages(row.images)) unlinkMedia(url)
      deleteProductStmt.run(row.id)
      return json(res, 200, { ok: true, id: row.id })
    })
  }

  // Загрузка фото: POST /api/admin/product/image?id=  (сырые байты в теле).
  // Тип определяем по magic-bytes (не по имени/Content-Type), пишем в MEDIA_DIR.
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/admin/product/image') {
    const id = Number(new URL(req.url, 'http://x').searchParams.get('id'))
    const row = getProductStmt.get(id)
    if (!row) return json(res, 404, { ok: false, error: 'not-found' })
    const current = safeParseImages(row.images)
    if (current.length >= MAX_IMAGES_PER_PRODUCT) {
      return json(res, 400, { ok: false, error: 'too-many-images' })
    }
    return readBuffer(
      req,
      (buf) => {
        if (!buf || !buf.length) return json(res, 400, { ok: false, error: 'empty' })
        const type = sniffImageType(buf)
        if (!type) return json(res, 400, { ok: false, error: 'bad-image' })
        const name = `p${id}-${randomInt(100000, 1000000)}.${IMAGE_EXT[type]}`
        try {
          fs.mkdirSync(MEDIA_DIR, { recursive: true })
          fs.writeFileSync(path.join(MEDIA_DIR, name), buf)
        } catch {
          return json(res, 500, { ok: false, error: 'write-failed' })
        }
        const url = `/media/${name}`
        const images = [...current, url].slice(0, MAX_IMAGES_PER_PRODUCT)
        updateImagesStmt.run(JSON.stringify(images), id)
        return json(res, 200, { ok: true, url, images })
      },
      MAX_IMAGE_BYTES,
    )
  }

  if (req.method === 'POST' && req.url === '/api/admin/product/image/delete') {
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const row = getProductStmt.get(Number(body.id))
      if (!row) return json(res, 404, { ok: false, error: 'not-found' })
      const url = String(body.url || '')
      const images = safeParseImages(row.images).filter((u) => u !== url)
      updateImagesStmt.run(JSON.stringify(images), row.id)
      unlinkMedia(url)
      return json(res, 200, { ok: true, images })
    })
  }

  if (req.method === 'POST' && req.url === '/api/admin/product/image/reorder') {
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const row = getProductStmt.get(Number(body.id))
      if (!row) return json(res, 404, { ok: false, error: 'not-found' })
      const next = Array.isArray(body.images) ? body.images.map(String) : []
      const current = safeParseImages(row.images)
      // Новый порядок обязан быть перестановкой текущего набора (без добавления/удаления).
      const same =
        next.length === current.length &&
        [...next].sort().join('|') === [...current].sort().join('|')
      if (!same) return json(res, 400, { ok: false, error: 'bad-order' })
      updateImagesStmt.run(JSON.stringify(next), row.id)
      return json(res, 200, { ok: true, images: next })
    })
  }

  // Список всех заказов
  if (req.method === 'GET' && req.url === '/api/admin/orders') {
    const rows = listStmt.all().map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      name: r.name,
      phone: r.phone,
      payment: r.payment,
      comment: r.comment,
      items: JSON.parse(r.items || '[]'),
      total: r.total,
      status: r.status,
      notified: Boolean(r.notified),
      holdUntil: r.hold_until,
    }))
    return json(res, 200, { ok: true, statuses: STATUSES, orders: rows })
  }

  // Смена статуса: POST /api/admin/order/<id>/status  { status }
  const adminStatus =
    req.method === 'POST' && req.url.match(/^\/api\/admin\/order\/([\w-]+)\/status$/)
  if (adminStatus) {
    const id = decodeURIComponent(adminStatus[1])
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      if (!STATUSES.includes(body.status)) return json(res, 400, { ok: false, error: 'bad-status' })
      if (!existsStmt.get(id)) return json(res, 404, { ok: false, error: 'not-found' })
      updateStatusStmt.run(body.status, id)
      return json(res, 200, { ok: true, id, status: body.status })
    })
    return
  }

  // Продление брони: POST /api/admin/order/<id>/extend  { days }
  // Сдвигает срок хранения (hold_until) на N дней от max(сейчас, текущий срок) —
  // продлить можно и просроченную бронь, получив свежее окно. Только для активных
  // (принята/подтверждена): продлевать отменённую/выполненную бессмысленно.
  const adminExtend =
    req.method === 'POST' && req.url.match(/^\/api\/admin\/order\/([\w-]+)\/extend$/)
  if (adminExtend) {
    const id = decodeURIComponent(adminExtend[1])
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'bad-json' })
      }
      const days = Number(body.days)
      if (!Number.isInteger(days) || days < 1 || days > EXTEND_MAX_DAYS) {
        return json(res, 400, { ok: false, error: 'bad-days' })
      }
      const row = getHoldStmt.get(id)
      if (!row) return json(res, 404, { ok: false, error: 'not-found' })
      if (!ACTIVE_STATUSES.includes(row.status)) {
        return json(res, 409, { ok: false, error: 'not-active', status: row.status })
      }
      const now = Date.now()
      const current = row.hold_until ? new Date(row.hold_until).getTime() : now
      const base = Math.max(now, Number.isFinite(current) ? current : now)
      // Абсолютный потолок — защита от накопительных опечаток (напр. многократное +30).
      const next = Math.min(base + days * DAY_MS, now + EXTEND_CAP_MS)
      const holdUntil = new Date(next).toISOString()
      extendStmt.run(holdUntil, id)
      return json(res, 200, { ok: true, id, status: row.status, holdUntil })
    })
    return
  }

  if (req.method !== 'POST' || req.url !== '/api/order') {
    return json(res, 404, { ok: false, error: 'not-found' })
  }

  // Анти-спам: ограничиваем частоту заказов с одного IP.
  const rl = orderLimiter(clientIp(req))
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return json(res, 429, { ok: false, error: 'rate-limited' })
  }

  let body = ''
  let aborted = false
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_BODY) {
      aborted = true
      json(res, 413, { ok: false, error: 'too-large' })
      req.destroy()
    }
  })
  req.on('end', async () => {
    if (aborted) return
    let order
    try {
      order = JSON.parse(body)
    } catch {
      return json(res, 400, { ok: false, error: 'bad-json' })
    }

    const err = validate(order)
    if (err) return json(res, 400, { ok: false, error: err })

    const id = newOrderId()
    const c = order.customer
    // Итог — с сервера (не из клиентского order.total). Перезаписываем order.total,
    // чтобы уведомление менеджеру показало тот же пересчитанный итог.
    const total = computeTotal(order.items)
    order.total = total
    const createdAt = new Date()
    const holdUntil = new Date(createdAt.getTime() + HOLD_DAYS * DAY_MS).toISOString()
    // Если покупатель вошёл в кабинет — привязываем бронь к аккаунту (иначе NULL,
    // гостевая бронь). Ошибка чтения сессии не должна мешать оформлению.
    let userId = null
    try {
      userId = currentUser(req)?.id ?? null
    } catch {
      userId = null
    }
    try {
      insertStmt.run(
        id,
        createdAt.toISOString(),
        (c.name || '').trim().slice(0, NAME_MAX),
        (c.phone || '').trim().slice(0, 32),
        (c.payment || '').slice(0, 32),
        (c.comment || '').trim().slice(0, COMMENT_MAX),
        JSON.stringify(order.items || []),
        total,
        holdUntil,
        userId,
      )
    } catch (e) {
      console.error('Ошибка записи в БД:', e)
      return json(res, 500, { ok: false, error: 'db-error' })
    }

    // Не блокируем ответ: заказ уже сохранён, уведомление best-effort
    // (с ретраями внутри). notifyTelegram сам ловит все ошибки — floating-промис
    // не приведёт к unhandledRejection.
    notifyTelegram(id, order)
    return json(res, 200, { ok: true, id, status: 'new', holdUntil })
  })
})

// Таймауты: обрываем медленные/зависшие соединения (slowloris-поверхность при
// прямом доступе мимо nginx), не держим сокеты вечно.
server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000

// Глобальные обработчики: одиночная ошибка в floating-промисе (напр. в досылке)
// не должна ронять процесс и останавливать приём заказов. Логируем best-effort.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err)
})

server.listen(PORT, () => {
  console.log(`Сервер заказов слушает порт ${PORT}`)
  console.log(`База данных: ${DB_PATH}`)
  console.log(`Разрешённые источники (CORS): ${ALLOWED_LIST.join(', ')}`)
  console.log(
    `Админка: ${ADMIN_TOKEN ? 'включена (/admin)' : 'выключена (задайте ADMIN_TOKEN в .env)'}`,
  )
})

// Досылка неотправленных уведомлений: первый проход вскоре после старта
// (на случай заказов, не уведомлённых до перезапуска), затем по интервалу.
// unref() — таймеры не мешают процессу завершиться при остановке.
const resendKickoff = setTimeout(() => resendPending(), 15_000)
const resendTimer = setInterval(() => resendPending(), RESEND_INTERVAL_MS)
resendKickoff.unref()
resendTimer.unref()

// Корректное завершение: перестаём принимать соединения и закрываем БД.
// tini (PID 1 в контейнере) пробрасывает сюда SIGTERM при `docker stop`.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`Получен ${sig}, завершаюсь…`)
    server.close(() => {
      try {
        db.close()
      } catch {}
      process.exit(0)
    })
    // Подстраховка, если соединения зависли.
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
