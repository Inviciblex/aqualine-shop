// Юнит-тесты логики ретраев отправки в Telegram. Без сети и реальных пауз —
// fetch и sleep инжектируются.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postJsonWithRetry } from '../notify.js'

const noSleep = () => Promise.resolve()
// Фейковый Response: задаём статус и тело json().
const resp = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json })
const base = { url: 'http://x', body: '{}', sleep: noSleep, log: () => {} }

test('успех с первой попытки', async () => {
  let calls = 0
  const r = await postJsonWithRetry({ ...base, fetchImpl: async () => (calls++, resp(200, { ok: true })) })
  assert.deepEqual(r, { ok: true, status: 200, attempts: 1 })
  assert.equal(calls, 1)
})

test('сетевой сбой дважды, затем успех → 3 попытки', async () => {
  let calls = 0
  const r = await postJsonWithRetry({
    ...base,
    fetchImpl: async () => {
      calls++
      if (calls < 3) throw new Error('fetch failed')
      return resp(200, { ok: true })
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.attempts, 3)
  assert.equal(calls, 3)
})

test('постоянный сетевой сбой → сдаёмся после retries', async () => {
  let calls = 0
  const r = await postJsonWithRetry({
    ...base,
    retries: 3,
    fetchImpl: async () => { calls++; throw new Error('fetch failed') },
  })
  assert.deepEqual(r, { ok: false, attempts: 3 })
  assert.equal(calls, 3)
})

test('4xx (кроме 429) — не повторяем', async () => {
  let calls = 0
  const r = await postJsonWithRetry({
    ...base,
    fetchImpl: async () => (calls++, resp(401, { ok: false, description: 'Unauthorized' })),
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
  assert.equal(calls, 1) // без повторов
})

test('429 — повторяемо: сначала 429, потом успех', async () => {
  let calls = 0
  const r = await postJsonWithRetry({
    ...base,
    fetchImpl: async () => {
      calls++
      return calls === 1 ? resp(429, { ok: false }) : resp(200, { ok: true })
    },
  })
  assert.equal(r.ok, true)
  assert.equal(calls, 2)
})

test('5xx — повторяемо', async () => {
  let calls = 0
  const r = await postJsonWithRetry({
    ...base,
    fetchImpl: async () => {
      calls++
      return calls < 2 ? resp(503, { ok: false }) : resp(200, { ok: true })
    },
  })
  assert.equal(r.ok, true)
  assert.equal(calls, 2)
})
