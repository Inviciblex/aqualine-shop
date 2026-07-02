// Тесты обращения к бэкенду заказов (src/order-api.js). fetch инжектируется.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStatusUrl,
  buildCancelUrl,
  requestOrder,
  requestCancel,
  requestStatus,
} from '../src/order-api.js'

const resp = (status, json) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
})

test('buildStatusUrl: null без apiUrl', () => {
  assert.equal(buildStatusUrl('', 'AQ-1'), null)
  assert.equal(buildStatusUrl(null, 'AQ-1'), null)
})

test('buildStatusUrl: добавляет id, убирает хвостовой слэш, кодирует', () => {
  assert.equal(buildStatusUrl('/api/order', 'AQ-1'), '/api/order/AQ-1')
  assert.equal(buildStatusUrl('/api/order/', 'AQ-1'), '/api/order/AQ-1')
  assert.equal(buildStatusUrl('/api/order', 'a b'), '/api/order/a%20b')
})

test('requestOrder: успех → { ok, id }', async () => {
  const r = await requestOrder('/api/order', { x: 1 }, async () =>
    resp(200, { ok: true, id: 'AQ-9' }),
  )
  assert.deepEqual(r, { ok: true, id: 'AQ-9' })
})

test('requestOrder: бэкенд вернул ok:false → reason из error', async () => {
  const r = await requestOrder('/api/order', {}, async () =>
    resp(400, { ok: false, error: 'bad-name' }),
  )
  assert.deepEqual(r, { ok: false, reason: 'bad-name' })
})

test('requestOrder: HTTP не-2xx без error → api-error', async () => {
  const r = await requestOrder('/api/order', {}, async () => resp(500, {}))
  assert.deepEqual(r, { ok: false, reason: 'api-error' })
})

test('requestOrder: сетевой сбой → network', async () => {
  const r = await requestOrder('/api/order', {}, async () => {
    throw new Error('fetch failed')
  })
  assert.deepEqual(r, { ok: false, reason: 'network' })
})

test('requestOrder: битый JSON в ответе → api-error', async () => {
  const r = await requestOrder('/api/order', {}, async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('bad json')
    },
  }))
  assert.deepEqual(r, { ok: false, reason: 'api-error' })
})

test('buildCancelUrl: /api/order → /api/order/<id>/cancel', () => {
  assert.equal(buildCancelUrl('/api/order', 'AQ-1'), '/api/order/AQ-1/cancel')
  assert.equal(buildCancelUrl('/api/order/', 'AQ-1'), '/api/order/AQ-1/cancel')
  assert.equal(buildCancelUrl('', 'AQ-1'), null)
})

test('requestCancel: без apiUrl → not-configured', async () => {
  const r = await requestCancel('', 'AQ-1', '+70000000000')
  assert.deepEqual(r, { ok: false, reason: 'not-configured' })
})

test('requestCancel: успех → { ok, status }', async () => {
  let sent
  const r = await requestCancel('/api/order', 'AQ-9', '+79990001122', async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body) }
    return resp(200, { ok: true, id: 'AQ-9', status: 'cancelled' })
  })
  assert.deepEqual(r, { ok: true, status: 'cancelled' })
  assert.equal(sent.url, '/api/order/AQ-9/cancel')
  assert.equal(sent.body.phone, '+79990001122')
})

test('requestCancel: телефон не совпал → reason phone-mismatch', async () => {
  const r = await requestCancel('/api/order', 'AQ-9', 'x', async () =>
    resp(403, { ok: false, error: 'phone-mismatch' }),
  )
  assert.deepEqual(r, { ok: false, reason: 'phone-mismatch', status: undefined })
})

test('requestCancel: уже не отменяема → reason+status', async () => {
  const r = await requestCancel('/api/order', 'AQ-9', 'x', async () =>
    resp(409, { ok: false, error: 'not-cancellable', status: 'done' }),
  )
  assert.deepEqual(r, { ok: false, reason: 'not-cancellable', status: 'done' })
})

test('requestCancel: сетевой сбой → network', async () => {
  const r = await requestCancel('/api/order', 'AQ-9', 'x', async () => {
    throw new Error('offline')
  })
  assert.deepEqual(r, { ok: false, reason: 'network' })
})

test('requestStatus: без apiUrl → not-configured', async () => {
  const r = await requestStatus('', 'AQ-1')
  assert.deepEqual(r, { ok: false, reason: 'not-configured' })
})

test('requestStatus: успех → { ok, status }', async () => {
  let url
  const r = await requestStatus('/api/order', 'AQ-9', async (u) => {
    url = u
    return resp(200, { ok: true, status: 'confirmed', total: 100 })
  })
  assert.deepEqual(r, { ok: true, status: 'confirmed' })
  assert.equal(url, '/api/order/AQ-9')
})

test('requestStatus: 404/ok:false → reason', async () => {
  const r = await requestStatus('/api/order', 'AQ-9', async () =>
    resp(404, { ok: false, error: 'not-found' }),
  )
  assert.deepEqual(r, { ok: false, reason: 'not-found' })
})

test('requestStatus: сетевой сбой → network', async () => {
  const r = await requestStatus('/api/order', 'AQ-9', async () => {
    throw new Error('offline')
  })
  assert.deepEqual(r, { ok: false, reason: 'network' })
})
