// Утилиты безопасности бэкенда. Без внешних зависимостей; вынесено отдельно
// ради тестируемости (часы инжектируются).

import crypto from 'node:crypto'

// Сравнение секретов за постоянное время — не даёт по времени ответа угадывать
// токен посимвольно (timing-атака). Возвращает false для не-строк и разных длин,
// но всё равно вызывает timingSafeEqual, чтобы время не зависело от длины.
export function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba)
    return false
  }
  return crypto.timingSafeEqual(ba, bb)
}

// Простой in-memory лимит запросов по ключу (IP): не более `max` за `windowMs`.
// Скользящее окно по временным меткам. now() инжектируется для тестов.
// Для небольшого магазина памяти достаточно; ключи без активных меток
// удаляются при проверке, плюс редкая полная чистка от «остывших» ключей.
export function createRateLimiter({ max = 20, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map() // key -> number[] (метки времени в окне)

  return function check(key) {
    const t = now()
    const cutoff = t - windowMs
    const recent = (hits.get(key) || []).filter((ts) => ts > cutoff)

    if (recent.length >= max) {
      hits.set(key, recent)
      const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000))
      return { allowed: false, retryAfter }
    }

    recent.push(t)
    hits.set(key, recent)

    // Опортунистическая чистка, чтобы Map не рос бесконечно по уникальным IP.
    if (hits.size > 5000) {
      for (const [k, arr] of hits) {
        if (!arr.some((ts) => ts > cutoff)) hits.delete(k)
      }
    }
    return { allowed: true }
  }
}

// Блокировка по КЛЮЧУ АККАУНТА (email при логине), а не по IP: перебор пароля с
// ротацией IP не обходит её. После `maxFails` неудач ключ блокируется на растущее
// время (30с → удвоение → потолок), окно сбрасывается после `idleResetMs` покоя.
// now() инжектируется для тестов.
export function createAttemptThrottle({
  maxFails = 5,
  baseLockMs = 30_000,
  maxLockMs = 15 * 60_000,
  idleResetMs = 15 * 60_000,
  now = Date.now,
} = {}) {
  const state = new Map() // key -> { fails, lockedUntil, last }

  function check(key) {
    const t = now()
    const s = state.get(key)
    if (!s) return { allowed: true }
    // Давно не трогали — забываем неудачи.
    if (t - s.last > idleResetMs) {
      state.delete(key)
      return { allowed: true }
    }
    if (s.lockedUntil && t < s.lockedUntil) {
      return { allowed: false, retryAfter: Math.ceil((s.lockedUntil - t) / 1000) }
    }
    return { allowed: true }
  }

  function fail(key) {
    const t = now()
    const s = state.get(key) || { fails: 0, lockedUntil: 0, last: t }
    s.fails += 1
    s.last = t
    if (s.fails >= maxFails) {
      const over = s.fails - maxFails
      s.lockedUntil = t + Math.min(baseLockMs * 2 ** over, maxLockMs)
    }
    state.set(key, s)
    // Не даём Map расти бесконечно.
    if (state.size > 5000) {
      for (const [k, v] of state) {
        if (t - v.last > idleResetMs) state.delete(k)
      }
    }
  }

  function reset(key) {
    state.delete(key)
  }

  return { check, fail, reset }
}
