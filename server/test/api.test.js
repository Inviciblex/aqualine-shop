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
      // Поднимаем лимиты: серия POST/cancel/admin в тестах иначе упёрлась бы в анти-спам.
      RL_MAX: '1000',
      RL_CANCEL_MAX: '1000',
      RL_ADMIN_MAX: '1000',
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

test('POST /api/order: некорректные позиции → 400 bad-item', async () => {
  const bad = [
    { name: '', sku: 'S', price: 100, qty: 1 }, // пустое имя
    { name: 'X', sku: 'S', price: -5, qty: 1 }, // отрицательная цена
    { name: 'X', sku: 'S', price: 'дорого', qty: 1 }, // цена не число
    { name: 'X', sku: 'S', price: 100, qty: 0 }, // нулевое количество
    { name: 'X', sku: 'S', price: 100, qty: 1.5 }, // дробное количество
    'строка-вместо-объекта', // не объект
  ]
  for (const item of bad) {
    const o = validOrder()
    o.items = [item]
    const r = await postOrder(o)
    assert.equal(r.status, 400, `ожидался 400 для ${JSON.stringify(item)}`)
    assert.equal(
      (await r.json()).error,
      'bad-item',
      `ожидался bad-item для ${JSON.stringify(item)}`,
    )
  }
})

test('POST /api/order: корректный заказ → 200, выдаёт id формата AQ-YYMMDD-NNNN', async () => {
  const r = await postOrder(validOrder())
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.ok, true)
  assert.equal(data.status, 'new')
  assert.match(data.id, /^AQ-\d{6}-\d{6}$/)

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

test('POST /api/order: итог считается на сервере, клиентский total игнорируется', async () => {
  const o = validOrder()
  o.items = [
    { name: 'Смеситель', sku: 'SKU-1', price: 4990, qty: 2 },
    { name: 'Сифон', sku: 'SKU-2', price: 500, qty: 3 },
  ]
  o.total = 1 // подделка: «всё за 1 ₽»
  const created = await (await postOrder(o)).json()
  assert.equal(created.ok, true)
  // Статус-эндпоинт отдаёт сохранённый total — должен быть пересчитан: 4990*2 + 500*3.
  const s = await (await fetch(`${BASE}/api/order/${created.id}`)).json()
  assert.equal(s.total, 4990 * 2 + 500 * 3)
})

test('POST /api/order: слишком длинное имя → 400 bad-name', async () => {
  const o = validOrder()
  o.customer.name = 'Я'.repeat(201)
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-name')
})

test('POST /api/order: слишком длинный телефон → 400 bad-phone', async () => {
  const o = validOrder()
  o.customer.phone = '+7' + '9'.repeat(20)
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-phone')
})

test('POST /api/order: слишком длинное имя позиции → 400 bad-item', async () => {
  const o = validOrder()
  o.items = [{ name: 'X'.repeat(201), sku: 'S', price: 100, qty: 1 }]
  const r = await postOrder(o)
  assert.equal(r.status, 400)
  assert.equal((await r.json()).error, 'bad-item')
})

test('POST /api/order: длинный комментарий обрезается до 2000 в БД', async () => {
  const o = validOrder()
  o.customer.comment = 'к'.repeat(5000)
  const created = await (await postOrder(o)).json()
  const { orders } = await (
    await fetch(`${BASE}/api/admin/orders`, { headers: { 'x-admin-token': ADMIN_TOKEN } })
  ).json()
  const row = orders.find((x) => x.id === created.id)
  assert.ok(row, 'заказ есть в админ-списке')
  assert.equal(row.comment.length, 2000)
})

test('GET /api/health → 200 (БД доступна)', async () => {
  const r = await fetch(`${BASE}/api/health`)
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true })
})

test('OPTIONS /api/order → 204 с CORS-заголовками (preflight)', async () => {
  const r = await fetch(`${BASE}/api/order`, { method: 'OPTIONS' })
  assert.equal(r.status, 204)
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
  assert.ok(r.headers.get('access-control-allow-origin'), 'есть Allow-Origin')
})

const postCancel = (id, phone) =>
  fetch(`${BASE}/api/order/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })

test('POST /api/order/<id>/cancel: неизвестный номер → 404', async () => {
  const r = await postCancel('AQ-000000-0000', '+79161234567')
  assert.equal(r.status, 404)
  assert.equal((await r.json()).error, 'not-found')
})

test('POST cancel: телефон не совпал → 403 phone-mismatch', async () => {
  const created = await (await postOrder(validOrder())).json()
  const r = await postCancel(created.id, '+70000000000')
  assert.equal(r.status, 403)
  assert.equal((await r.json()).error, 'phone-mismatch')
})

test('POST cancel: верный телефон (иной формат тех же цифр) → 200 cancelled', async () => {
  const created = await (await postOrder(validOrder())).json()
  // Телефон заказа '+7 (916) 123-45-67' — сверка по цифрам: скобки/пробелы/дефисы
  // не важны, но набор цифр (7916…) должен совпадать.
  const r = await postCancel(created.id, '+7 916 123 4567')
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.ok, true)
  assert.equal(data.status, 'cancelled')

  // Статус в БД действительно стал cancelled.
  const s = await (await fetch(`${BASE}/api/order/${created.id}`)).json()
  assert.equal(s.status, 'cancelled')
})

test('POST cancel: повторная отмена уже отменённой → 409 not-cancellable', async () => {
  const created = await (await postOrder(validOrder())).json()
  await postCancel(created.id, '+79161234567') // первая отмена
  const r = await postCancel(created.id, '+79161234567') // вторая
  assert.equal(r.status, 409)
  const data = await r.json()
  assert.equal(data.error, 'not-cancellable')
  assert.equal(data.status, 'cancelled')
})

test('admin/orders отдаёт notified=false, пока Telegram недоступен', async () => {
  // Свежий заказ. С тестовым токеном отправка в Telegram гарантированно падает,
  // поэтому уведомление считается недоставленным — это и помечает досылка.
  const created = await (await postOrder(validOrder())).json()
  const r = await fetch(`${BASE}/api/admin/orders`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  })
  const { orders } = await r.json()
  const row = orders.find((o) => o.id === created.id)
  assert.ok(row, 'созданный заказ есть в списке')
  assert.equal(row.notified, false, 'notified — булево false при недоставленном уведомлении')
})

// ── Срок брони (hold_until) и продление админом ──

const DAY = 86_400_000
const postExtend = (id, body, token = ADMIN_TOKEN) =>
  fetch(`${BASE}/api/admin/order/${id}/extend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
    },
    body: JSON.stringify(body),
  })

test('POST /api/order: ответ содержит holdUntil ≈ createdAt + 2 дня', async () => {
  const data = await (await postOrder(validOrder())).json()
  assert.ok(data.holdUntil, 'есть holdUntil')
  const hold = new Date(data.holdUntil).getTime()
  // Срок — примерно через 2 дня от сейчас (допуск в минуту на выполнение теста).
  assert.ok(Math.abs(hold - (Date.now() + 2 * DAY)) < 60_000, 'holdUntil ≈ сейчас + 2 дня')
})

test('GET /api/order/<id>: возвращает holdUntil', async () => {
  const created = await (await postOrder(validOrder())).json()
  const s = await (await fetch(`${BASE}/api/order/${created.id}`)).json()
  assert.equal(s.holdUntil, created.holdUntil)
})

test('extend без токена → 401', async () => {
  const created = await (await postOrder(validOrder())).json()
  const r = await postExtend(created.id, { days: 7 }, '')
  assert.equal(r.status, 401)
})

test('extend: некорректные days → 400 bad-days', async () => {
  const created = await (await postOrder(validOrder())).json()
  for (const days of [0, -1, 31, 1.5, 'семь', null]) {
    const r = await postExtend(created.id, { days })
    assert.equal(r.status, 400, `ожидался 400 для days=${JSON.stringify(days)}`)
    assert.equal((await r.json()).error, 'bad-days')
  }
})

test('extend: неизвестный заказ → 404', async () => {
  const r = await postExtend('AQ-000000-000000', { days: 2 })
  assert.equal(r.status, 404)
  assert.equal((await r.json()).error, 'not-found')
})

test('extend: активную бронь продлевает, срок сдвигается вперёд на N дней', async () => {
  const created = await (await postOrder(validOrder())).json()
  const before = new Date(created.holdUntil).getTime()
  const r = await postExtend(created.id, { days: 7 })
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.ok, true)
  const after = new Date(data.holdUntil).getTime()
  // База продления = max(сейчас, текущий срок) = текущий срок (он в будущем).
  assert.ok(Math.abs(after - before - 7 * DAY) < 60_000, 'срок вырос ровно на 7 дней')

  // И новый срок читается через статус-эндпоинт.
  const s = await (await fetch(`${BASE}/api/order/${created.id}`)).json()
  assert.equal(s.holdUntil, data.holdUntil)
})

test('extend: отменённую бронь нельзя продлить → 409 not-active', async () => {
  const created = await (await postOrder(validOrder())).json()
  // Переводим в cancelled через админ-смену статуса.
  await fetch(`${BASE}/api/admin/order/${created.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  const r = await postExtend(created.id, { days: 2 })
  assert.equal(r.status, 409)
  const data = await r.json()
  assert.equal(data.error, 'not-active')
  assert.equal(data.status, 'cancelled')
})
