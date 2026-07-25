// Утилиты авторизации покупателей (личный кабинет). Без внешних зависимостей —
// только node:crypto. Вынесено отдельно от server.js ради тестируемости: чистые
// функции (хеш пароля, подпись/проверка сессии, разбор cookie, валидация email/
// пароля) покрываются юнит-тестами, часы (now) инжектируются.
//
// Модель: email + пароль. Пароль хранится как scrypt-хеш с солью. Сессия —
// БЕЗ таблицы в БД: подписанная HMAC-SHA256 кука несёт { uid, exp, sv }, где
// sv («session version») выводится из текущего хеша пароля. Смена пароля меняет
// sv → все ранее выданные куки перестают проходить проверку (разлогинивает
// старые устройства без хранилища сессий).

import crypto from 'node:crypto'

const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_BYTES = 16

// ── Пароли ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':')
  if (!saltHex || !hashHex) return false
  let salt, expected, test
  try {
    salt = Buffer.from(saltHex, 'hex')
    expected = Buffer.from(hashHex, 'hex')
    test = crypto.scryptSync(String(password), salt, expected.length || SCRYPT_KEYLEN)
  } catch {
    return false
  }
  return expected.length === test.length && crypto.timingSafeEqual(expected, test)
}

// Заранее посчитанный «пустой» хеш: логин по несуществующему email всё равно
// прогоняет scrypt против него, чтобы по времени ответа нельзя было определить,
// зарегистрирован ли адрес (защита от перебора существующих аккаунтов).
export const DUMMY_PASSWORD_HASH = hashPassword('dummy-password-placeholder-value')

// ── Сессии (подписанная кука, без хранилища) ──
// sv привязывает сессию к текущему паролю: сменил пароль → старые куки мертвы.
export function sessionVersion(secret, pwdHash) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(String(pwdHash))
    .digest('base64url')
    .slice(0, 16)
}

export function signSession(secret, uid, pwdHash, ttlMs, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: now + ttlMs, sv: sessionVersion(secret, pwdHash) }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// Возвращает { uid, exp, sv } при валидной, непросроченной, корректно подписанной
// куке — иначе null. Подпись сверяем за постоянное время.
export function verifySession(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) return null
  const dot = token.indexOf('.')
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let data
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !data ||
    !Number.isInteger(data.uid) ||
    typeof data.exp !== 'number' ||
    typeof data.sv !== 'string'
  ) {
    return null
  }
  if (now > data.exp) return null
  return data
}

// ── Cookie ──
export function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k) continue
    const v = part.slice(i + 1).trim()
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}

// ── Валидация входных данных ──
export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}
// Нормализация пароля: приводим к единой Unicode-форме (NFKC) — чтобы визуально
// одинаковый пароль, набранный разными раскладками/составными символами, совпадал
// при регистрации и входе. Пробелы НЕ режем (могут быть значимой частью пароля).
// Применять ОДИНАКОВО при регистрации, входе и смене пароля (иначе вход не сойдётся).
export function normalizePassword(pw) {
  return typeof pw === 'string' ? pw.normalize('NFKC') : ''
}
export function isValidEmail(email) {
  const e = normalizeEmail(email)
  // Прагматичная проверка (не RFC-полная): один @, точка в домене, без пробелов.
  return e.length >= 3 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
export function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 200
}
