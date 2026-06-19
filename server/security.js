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
