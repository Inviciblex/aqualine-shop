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
const ALLOWED_LIST = ALLOWED_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
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
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name       TEXT,
    phone      TEXT,
    address    TEXT,
    delivery   TEXT,
    payment    TEXT,
    comment    TEXT,
    items      TEXT,
    total      INTEGER,
    status     TEXT NOT NULL DEFAULT 'new'
  )
`)
const insertStmt = db.prepare(`
  INSERT INTO orders (id, created_at, name, phone, address, delivery, payment, comment, items, total, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
`)
const getStmt = db.prepare('SELECT id, created_at, total, status FROM orders WHERE id = ?')
const existsStmt = db.prepare('SELECT 1 FROM orders WHERE id = ?')
const listStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500')
const updateStatusStmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?')

function newOrderId() {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  for (let i = 0; i < 20; i++) {
    const id = `AQ-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`
    if (!existsStmt.get(id)) return id
  }
  return `AQ-${Date.now()}`
}

// ── Telegram ──
const PAYMENT = { card: 'Картой при получении', cash: 'Наличными' }
const rub = (v) => new Intl.NumberFormat('ru-RU').format(v) + ' \u20bd'

function buildMessage(id, order) {
  const c = order.customer || {}
  const lines = [
    `\u{1F6C1} Новый заказ ${id}`,
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
  if (!result.ok) {
    console.error(`Не удалось отправить заказ ${id} в Telegram после ${result.attempts} попыток (заказ сохранён).`)
  }
  return result.ok
}

// ── Валидация ──
function validate(order) {
  if (!order || typeof order !== 'object') return 'bad-payload'
  const c = order.customer
  if (!c || typeof c.name !== 'string' || c.name.trim().length < 2) return 'bad-name'
  if (typeof c.phone !== 'string' || c.phone.replace(/\D/g, '').length < 10) return 'bad-phone'
  if (!Array.isArray(order.items) || order.items.length === 0) return 'empty-cart'
  if (order.items.length > 200) return 'too-many-items'
  // Проверяем форму каждой позиции — иначе мусор уходит в БД и в Telegram.
  for (const it of order.items) {
    if (!it || typeof it !== 'object') return 'bad-item'
    if (typeof it.name !== 'string' || it.name.trim().length === 0) return 'bad-item'
    if (!Number.isFinite(it.price) || it.price < 0) return 'bad-item'
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 1000) return 'bad-item'
  }
  return null
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
const orderLimiter = createRateLimiter({ max: 20, windowMs: 60_000 })
// Реальный IP клиента: за nginx он в X-Forwarded-For (см. deploy/nginx.conf).
const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress ||
  'unknown'

const server = http.createServer((req, res) => {
  setCors(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, { ok: true })
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

  // ── Админка (защищена токеном ADMIN_TOKEN) ──
  const isAdmin = Boolean(ADMIN_TOKEN) && safeTokenEqual(req.headers['x-admin-token'] || '', ADMIN_TOKEN)

  if (req.url === '/api/admin/orders' || /^\/api\/admin\/order\//.test(req.url)) {
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
    }))
    return json(res, 200, { ok: true, statuses: STATUSES, orders: rows })
  }

  // Смена статуса: POST /api/admin/order/<id>/status  { status }
  const adminStatus = req.method === 'POST' && req.url.match(/^\/api\/admin\/order\/([\w-]+)\/status$/)
  if (adminStatus) {
    const id = decodeURIComponent(adminStatus[1])
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > MAX_BODY) req.destroy() })
    req.on('end', () => {
      let body
      try { body = JSON.parse(raw) } catch { return json(res, 400, { ok: false, error: 'bad-json' }) }
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
    try {
      insertStmt.run(
        id,
        new Date().toISOString(),
        (c.name || '').trim(),
        (c.phone || '').trim(),
        (c.address || '').trim(),
        c.delivery || '',
        c.payment || '',
        (c.comment || '').trim(),
        JSON.stringify(order.items || []),
        Number(order.total) || 0,
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

server.listen(PORT, () => {
  console.log(`Сервер заказов слушает порт ${PORT}`)
  console.log(`База данных: ${DB_PATH}`)
  console.log(`Разрешённые источники (CORS): ${ALLOWED_LIST.join(', ')}`)
  console.log(`Админка: ${ADMIN_TOKEN ? 'включена (admin.html)' : 'выключена (задайте ADMIN_TOKEN в .env)'}`)
})

// Корректное завершение: перестаём принимать соединения и закрываем БД.
// tini (PID 1 в контейнере) пробрасывает сюда SIGTERM при `docker stop`.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`Получен ${sig}, завершаюсь…`)
    server.close(() => {
      try { db.close() } catch {}
      process.exit(0)
    })
    // Подстраховка, если соединения зависли.
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
