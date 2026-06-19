// Интеграционные тесты API заказов. Без внешних зависимостей — встроенный
// node:test. Поднимаем настоящий сервер в дочернем процессе на временной БД
// и стучимся по HTTP, как это делает фронт.
//
// Запуск:  npm test         (из папки server/)
//          node --test test/

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, '..')

const PORT = 8799
const BASE = `http://127.0.0.1:${PORT}`
const ADMIN_TOKEN = 'test-admin-token'

let child
let tmpDir

// Корректный заказ — переиспользуем в нескольких тестах.
const validOrder = () => ({
  customer: { name: 'Иван Тестов', phone: '+7 (916) 123-45-67', payment: 'cash' },
  items: [{ name: 'Смеситель', sku: 'SKU-1', price: 4990, qty: 1 }],
  total: 4990,
})

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqualine-test-'))
  child = spawn('node', ['server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmpDir, 'test.db'),
      // Dummy-значения: сервер требует их при старте; реальные запросы в
      // Telegram упадут и будут проглочены try/catch внутри сервера.
      TG_BOT_TOKEN: 'test:token',
      TG_CHAT_ID: '0',
      ADMIN_TOKEN,
      ALLOWED_ORIGIN: '*',
    },
    stdio: 'ignore',
  })

  // Ждём, пока сервер поднимется и ответит на /api/health.
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return
    } catch {
      // ещё не слушает — повторим
    }
    await new Promise((res) => setTimeout(res, 150))
  }
  throw new Error('Сервер не поднялся за отведённое время')
})

after(() => {
  if (child) child.kill('SIGTERM')
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const postOrder = (body) =>
  fetch(`${BASE}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

test('GET /api/health → 200 { ok: true }', async () => {
  const r = await fetch(`${BASE}/api/health`)
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true })
})

test('неизвестный маршрут → 404', async () => {
  const r = await fetch(`${BASE}/api/nope`)
  assert.equal(r.status, 404)
  assert.equal((await r.json()).error, 'not-found')
})

test('POST /api/order: битый JSON → 400 bad-json', async () => {
  const r = await postOrder('{не json')
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-json')
})

test('POST /api/order: без имени → 400 bad-name', async () => {
  const o = validOrder()
  o.customer.name = 'A'
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-name')
})

test('POST /api/order: короткий телефон → 400 bad-phone', async () => {
  const o = validOrder()
  o.customer.phone = '123'
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-phone')
})

test('POST /api/order: пустая корзина → 400 empty-cart', async () => {
  const o = validOrder()
  o.items = []
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'empty-cart')
})

test('POST /api/order: корректный заказ → 200, выдаёт id формата AQ-YYMMDD-NNNN', async () => {
  const r = await postOrder(validOrder())
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.ok, true)
  assert.equal(data.status, 'new')
  assert.match(data.id, /^AQ-\d{6}-\d{4}$/)

  // И сразу проверяем, что заказ читается по своему номеру.
  const s = await fetch(`${BASE}/api/order/${data.id}`)
  assert.equal(s.status, 200)
  const sd = await s.json()
  assert.equal(sd.ok, true)
  assert.equal(sd.status, 'new')
  assert.equal(sd.total, 4990)
})

test('GET /api/order/<неизвестный> → 404 not-found', async () => {
  const r = await fetch(`${BASE}/api/order/AQ-000000-0000`)
  assert.equal(r.status, 404)
  assert.equal((await r.json()).error, 'not-found')
})

test('GET /api/admin/orders без токена → 401', async () => {
  const r = await fetch(`${BASE}/api/admin/orders`)
  assert.equal(r.status, 401)
})

test('GET /api/admin/orders с токеном → 200 и список заказов', async () => {
  const r = await fetch(`${BASE}/api/admin/orders`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  })
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.ok, true)
  assert.ok(Array.isArray(data.orders))
})
