// Юнит-тесты утилит безопасности. Часы инжектируются — тесты мгновенные.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeTokenEqual, createRateLimiter } from '../security.js'

test('safeTokenEqual: равные строки → true', () => {
  assert.equal(safeTokenEqual('s3cret-token', 's3cret-token'), true)
})

test('safeTokenEqual: разные значения → false', () => {
  assert.equal(safeTokenEqual('s3cret-token', 's3cret-tokeX'), false)
})

test('safeTokenEqual: разная длина → false (без исключения)', () => {
  assert.equal(safeTokenEqual('short', 'much-longer-token'), false)
})

test('safeTokenEqual: пустые/не-строки → false', () => {
  assert.equal(safeTokenEqual('', ''), false)
  assert.equal(safeTokenEqual('x', ''), false)
  assert.equal(safeTokenEqual(undefined, 'x'), false)
  assert.equal(safeTokenEqual(null, null), false)
})

test('createRateLimiter: пропускает до max, затем блокирует', () => {
  let t = 1_000_000
  const check = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t })
  assert.equal(check('1.2.3.4').allowed, true)
  assert.equal(check('1.2.3.4').allowed, true)
  assert.equal(check('1.2.3.4').allowed, true)
  const blocked = check('1.2.3.4')
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60)
})

test('createRateLimiter: разные ключи (IP) независимы', () => {
  let t = 0
  const check = createRateLimiter({ max: 1, windowMs: 60_000, now: () => t })
  assert.equal(check('a').allowed, true)
  assert.equal(check('a').allowed, false)
  assert.equal(check('b').allowed, true) // другой IP не затронут
})

test('createRateLimiter: окно сбрасывается со временем', () => {
  let t = 0
  const check = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
  assert.equal(check('ip').allowed, true)
  assert.equal(check('ip').allowed, true)
  assert.equal(check('ip').allowed, false)
  t += 1001 // окно прошло
  assert.equal(check('ip').allowed, true)
})
