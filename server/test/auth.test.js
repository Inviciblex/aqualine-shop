// Тесты авторизации кабинета: юнит-тесты чистых функций (auth.js, security.js)
// + интеграционные тесты /api/auth/* и /api/orders против настоящего сервера.
//
// Запуск:  node --test test/   (из папки server/)

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

import {
  hashPassword,
  verifyPassword,
  sessionVersion,
  signSession,
  verifySession,
  parseCookies,
  normalizeEmail,
  isValidEmail,
  isValidPassword,
} from '../auth.js'
import { createAttemptThrottle } from '../security.js'

// ─────────────────────────── Юнит: auth.js ───────────────────────────
test('hashPassword/verifyPassword: верный пароль проходит, неверный — нет', () => {
  const stored = hashPassword('correct horse battery')
  assert.equal(verifyPassword('correct horse battery', stored), true)
  assert.equal(verifyPassword('wrong', stored), false)
  assert.notEqual(hashPassword('x'), hashPassword('x')) // соль случайна
})

test('verifyPassword: битый/пустой хеш → false без исключения', () => {
  assert.equal(verifyPassword('x', ''), false)
  assert.equal(verifyPassword('x', 'nosalt'), false)
  assert.equal(verifyPassword('x', 'zz:zz'), false)
})

test('signSession/verifySession: валидная кука разбирается', () => {
  const secret = 'test-secret'
  const pwd = hashPassword('pw12345678')
  const token = signSession(secret, 7, pwd, 60_000, 1000)
  const data = verifySession(secret, token, 2000)
  assert.equal(data.uid, 7)
  assert.equal(data.sv, sessionVersion(secret, pwd))
})

test('verifySession: подделка подписи, чужой секрет, просрочка, мусор → null', () => {
  const secret = 'test-secret'
  const pwd = hashPassword('pw12345678')
  const token = signSession(secret, 7, pwd, 60_000, 1000)
  assert.equal(verifySession('other-secret', token, 2000), null)
  assert.equal(verifySession(secret, token, 999_999_999), null) // истёк
  assert.equal(verifySession(secret, token + 'x', 2000), null) // подпись
  assert.equal(verifySession(secret, 'garbage', 2000), null)
  assert.equal(verifySession(secret, '', 2000), null)
})

test('sessionVersion меняется при смене пароля (инвалидация старых сессий)', () => {
  const secret = 's'
  assert.notEqual(
    sessionVersion(secret, hashPassword('old-password')),
    sessionVersion(secret, hashPassword('new-password')),
  )
})

test('parseCookies разбирает заголовок Cookie', () => {
  assert.deepEqual(parseCookies('a=1; b=two; c='), { a: '1', b: 'two', c: '' })
  assert.deepEqual(parseCookies(''), {})
  assert.deepEqual(parseCookies(undefined), {})
})

test('валидация email/пароля', () => {
  assert.equal(normalizeEmail('  A@B.RU '), 'a@b.ru')
  assert.equal(isValidEmail('a@b.ru'), true)
  assert.equal(isValidEmail('no-at'), false)
  assert.equal(isValidEmail('a@b'), false)
  assert.equal(isValidPassword('12345678'), true)
  assert.equal(isValidPassword('short'), false)
  assert.equal(isValidPassword(12345678), false)
})

// ─────────────────────── Юнит: attempt throttle ───────────────────────
test('createAttemptThrottle: блокирует после maxFails, reset снимает', () => {
  let now = 0
  const th = createAttemptThrottle({ maxFails: 3, baseLockMs: 1000, now: () => now })
  assert.equal(th.check('a').allowed, true)
  th.fail('a')
  th.fail('a')
  assert.equal(th.check('a').allowed, true) // ещё не достигли порога
  th.fail('a') // 3-я неудача → блок
  assert.equal(th.check('a').allowed, false)
  th.reset('a')
  assert.equal(th.check('a').allowed, true)
})

test('createAttemptThrottle: блок снимается по истечении времени', () => {
  let now = 0
  const th = createAttemptThrottle({ maxFails: 1, baseLockMs: 1000, now: () => now })
  th.fail('a')
  assert.equal(th.check('a').allowed, false)
  now += 1001
  assert.equal(th.check('a').allowed, true)
})

// ─────────────────────── Интеграция: /api/auth/* ───────────────────────
const PORT = 8802
const BASE = `http://127.0.0.1:${PORT}`
let child
let tmpDir

// Простой cookie-jar поверх fetch: сохраняет aq_session между запросами.
function makeClient() {
  let cookie = ''
  return async function req(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const setC = res.headers.getSetCookie?.() || []
    for (const c of setC) {
      const kv = c.split(';')[0]
      if (kv.startsWith('aq_session=')) cookie = kv
    }
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    return { status: res.status, data }
  }
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqualine-auth-'))
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  child = spawn('node', ['server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmpDir, 'test.db'),
      MEDIA_DIR: path.join(tmpDir, 'media'),
      TG_BOT_TOKEN: 'test:token',
      TG_CHAT_ID: '0',
      ADMIN_TOKEN: 'test-admin-token',
      SESSION_SECRET: 'test-session-secret',
      ALLOWED_ORIGIN: '*',
      RL_MAX: '1000',
      RL_AUTH_MAX: '1000',
    },
    stdio: 'ignore',
  })
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return
    } catch {
      // ещё не слушает
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('Сервер не поднялся')
})

after(() => {
  if (child) child.kill()
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const creds = { email: 'buyer@example.ru', password: 'password12345' }

test('register: валидация email/пароля и дубликата', async () => {
  const c = makeClient()
  assert.equal(
    (
      await c('/api/auth/register', {
        method: 'POST',
        body: { email: 'x', password: 'password12345' },
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await c('/api/auth/register', {
        method: 'POST',
        body: { email: 'a@b.ru', password: 'short' },
      })
    ).status,
    400,
  )
  const ok = await c('/api/auth/register', {
    method: 'POST',
    body: { ...creds, name: 'Покупатель' },
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.user.email, creds.email)
  // повторная регистрация того же email
  const dup = await c('/api/auth/register', { method: 'POST', body: creds })
  assert.equal(dup.status, 409)
  assert.equal(dup.data.error, 'email-taken')
})

test('me: без сессии → { ok: false }, с сессией → пользователь', async () => {
  const anon = makeClient()
  const noauth = await anon('/api/auth/me')
  assert.equal(noauth.data.ok, false)

  const c = makeClient()
  await c('/api/auth/login', { method: 'POST', body: creds })
  const me = await c('/api/auth/me')
  assert.equal(me.data.ok, true)
  assert.equal(me.data.user.email, creds.email)
})

test('login: неверный пароль → 401 bad-credentials', async () => {
  const c = makeClient()
  const r = await c('/api/auth/login', {
    method: 'POST',
    body: { email: creds.email, password: 'nope-nope-nope' },
  })
  assert.equal(r.status, 401)
  assert.equal(r.data.error, 'bad-credentials')
})

test('profile: требует входа; обновляет имя/телефон', async () => {
  const anon = makeClient()
  assert.equal(
    (await anon('/api/auth/profile', { method: 'POST', body: { name: 'X' } })).status,
    401,
  )

  const c = makeClient()
  await c('/api/auth/login', { method: 'POST', body: creds })
  const upd = await c('/api/auth/profile', {
    method: 'POST',
    body: { name: 'Новое Имя', phone: '+7 900 000-00-00' },
  })
  assert.equal(upd.status, 200)
  assert.equal(upd.data.user.name, 'Новое Имя')
})

test('password: неверный текущий → 403; смена инвалидирует старую куку', async () => {
  const c = makeClient()
  await c('/api/auth/login', { method: 'POST', body: creds })
  // старую куку сохраним отдельным клиентом (клонируем через отдельный логин)
  const stale = makeClient()
  await stale('/api/auth/login', { method: 'POST', body: creds })

  assert.equal(
    (
      await c('/api/auth/password', {
        method: 'POST',
        body: { current: 'wrong', next: 'brandnewpass1' },
      })
    ).status,
    403,
  )
  const ok = await c('/api/auth/password', {
    method: 'POST',
    body: { current: creds.password, next: 'brandnewpass1' },
  })
  assert.equal(ok.status, 200)
  // c переиздал куку (та же сессия жива), а stale держит старый sv → разлогинен
  assert.equal((await c('/api/auth/me')).data.ok, true)
  assert.equal((await stale('/api/auth/me')).data.ok, false)
  // вернём пароль обратно, чтобы не влиять на другие тесты по этому же аккаунту
  await c('/api/auth/password', {
    method: 'POST',
    body: { current: 'brandnewpass1', next: creds.password },
  })
})

test('logout очищает сессию', async () => {
  const c = makeClient()
  await c('/api/auth/login', { method: 'POST', body: creds })
  assert.equal((await c('/api/auth/me')).data.ok, true)
  await c('/api/auth/logout', { method: 'POST' })
  assert.equal((await c('/api/auth/me')).data.ok, false)
})

test('GET /api/orders: гость → 401; вошедшему видны его брони', async () => {
  const anon = makeClient()
  assert.equal((await anon('/api/orders')).status, 401)

  const c = makeClient()
  await c('/api/auth/login', { method: 'POST', body: creds })
  const before = await c('/api/orders')
  assert.equal(before.status, 200)
  const n0 = before.data.orders.length

  // Оформляем бронь под этой сессией — должна привязаться к аккаунту.
  const order = {
    customer: { name: 'Покупатель', phone: '+7 (916) 111-22-33', payment: 'cash' },
    items: [{ name: 'Смеситель', sku: 'SKU-1', price: 4990, qty: 1 }],
  }
  const created = await c('/api/order', { method: 'POST', body: order })
  assert.equal(created.status, 200)

  const after = await c('/api/orders')
  assert.equal(after.data.orders.length, n0 + 1)
  assert.equal(after.data.orders[0].id, created.data.id)

  // Гость свою (пустую) историю не мешает — заказ гостя не привязан.
  const guest = makeClient()
  const guestOrder = await guest('/api/order', { method: 'POST', body: order })
  assert.equal(guestOrder.status, 200)
  assert.equal((await guest('/api/orders')).status, 401)
})
