// Тесты обращения к бэкенду заказов (src/order-api.js). fetch инжектируется.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatusUrl, requestOrder } from '../src/order-api.js'

const resp = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json })

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
  const r = await requestOrder('/api/order', { x: 1 }, async () => resp(200, { ok: true, id: 'AQ-9' }))
  assert.deepEqual(r, { ok: true, id: 'AQ-9' })
})

test('requestOrder: бэкенд вернул ok:false → reason из error', async () => {
  const r = await requestOrder('/api/order', {}, async () => resp(400, { ok: false, error: 'bad-name' }))
  assert.deepEqual(r, { ok: false, reason: 'bad-name' })
})

test('requestOrder: HTTP не-2xx без error → api-error', async () => {
  const r = await requestOrder('/api/order', {}, async () => resp(500, {}))
  assert.deepEqual(r, { ok: false, reason: 'api-error' })
})

test('requestOrder: сетевой сбой → network', async () => {
  const r = await requestOrder('/api/order', {}, async () => { throw new Error('fetch failed') })
  assert.deepEqual(r, { ok: false, reason: 'network' })
})

test('requestOrder: битый JSON в ответе → api-error', async () => {
  const r = await requestOrder('/api/order', {}, async () => ({
    ok: true, status: 200, json: async () => { throw new Error('bad json') },
  }))
  assert.deepEqual(r, { ok: false, reason: 'api-error' })
})
