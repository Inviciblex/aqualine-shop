// Отправка JSON-сообщения с таймаутом на попытку и ретраями.
// Вынесено из server.js ради тестируемости: fetch и sleep инжектируются,
// поэтому в тестах сеть и реальные задержки не нужны.
//
// Успех = HTTP 2xx И тело ответа с { ok: true } (соглашение Telegram Bot API).
// Повторяем при сетевом сбое/таймауте, а также при HTTP 429 и 5xx (временные).
// При 4xx (кроме 429) повтор бесполезен — это постоянная ошибка (токен/чат/текст).

export async function postJsonWithRetry({
  url,
  body,
  retries = 3,
  timeoutMs = 5000,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.error,
}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data && data.ok) return { ok: true, status: res.status, attempts: attempt }

      const retryable = res.status === 429 || res.status >= 500
      log(`Telegram отклонил (попытка ${attempt}/${retries}, HTTP ${res.status}):`, data)
      if (!retryable) return { ok: false, status: res.status, attempts: attempt }
    } catch (e) {
      // Сетевой сбой или срабатывание таймаута (AbortError) — повторяемо.
      log(`Telegram недоступен (попытка ${attempt}/${retries}): ${e.message}`)
    }
    // Линейная пауза перед следующей попыткой: 0.5s, 1s, … (кроме последней).
    if (attempt < retries) await sleep(500 * attempt)
  }
  return { ok: false, attempts: retries }
}
