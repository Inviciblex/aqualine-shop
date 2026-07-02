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
import { postJsonWithRetry } from './notify.js'
import { safeTokenEqual, createRateLimiter } from './security.js'

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
// Секрет для админки. Если не задан — админ-эндпоинты выключены.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
const STATUSES = ['new', 'confirmed', 'done', 'cancelled']

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
    notified   INTEGER NOT NULL DEFAULT 0
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
// Индексы: список в админке (ORDER BY created_at) и выборка досылки
// (WHERE notified=0 AND created_at BETWEEN) иначе делают полное сканирование —
// таблица только растёт (заказы не удаляются).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_notified_created ON orders(notified, created_at);
`)
const insertStmt = db.prepare(`
  INSERT INTO orders (id, created_at, name, phone, payment, comment, items, total, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
`)
const getStmt = db.prepare('SELECT id, created_at, total, status FROM orders WHERE id = ?')
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

  // Статус заказа по номеру: GET /api/order/AQ-...
  const statusMatch = req.method === 'GET' && req.url.match(/^\/api\/order\/([\w-]+)$/)
  if (statusMatch) {
    const row = getStmt.get(decodeURIComponent(statusMatch[1]))
    if (!row) return json(res, 404, { ok: false, error: 'not-found' })
    return json(res, 200, {
      ok: true,
      id: row.id,
      status: row.status,
      total: row.total,
      createdAt: row.created_at,
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

  if (req.url === '/api/admin/orders' || /^\/api\/admin\/order\//.test(req.url)) {
    const rl = adminLimiter(clientIp(req))
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return json(res, 429, { ok: false, error: 'rate-limited' })
    }
    if (!ADMIN_TOKEN) return json(res, 503, { ok: false, error: 'admin-disabled' })
    if (!isAdmin) return json(res, 401, { ok: false, error: 'unauthorized' })
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
    try {
      insertStmt.run(
        id,
        new Date().toISOString(),
        (c.name || '').trim().slice(0, NAME_MAX),
        (c.phone || '').trim().slice(0, 32),
        (c.payment || '').slice(0, 32),
        (c.comment || '').trim().slice(0, COMMENT_MAX),
        JSON.stringify(order.items || []),
        total,
      )
    } catch (e) {
      console.error('Ошибка записи в БД:', e)
      return json(res, 500, { ok: false, error: 'db-error' })
    }

    // Не блокируем ответ: заказ уже сохранён, уведомление best-effort
    // (с ретраями внутри). notifyTelegram сам ловит все ошибки — floating-промис
    // не приведёт к unhandledRejection.
    notifyTelegram(id, order)
    return json(res, 200, { ok: true, id, status: 'new' })
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
    `Админка: ${ADMIN_TOKEN ? 'включена (admin.html)' : 'выключена (задайте ADMIN_TOKEN в .env)'}`,
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
