// Чистая логика обращения к бэкенду заказов. Вынесено из sendOrder.js (без
// import.meta.env), чтобы покрыть тестами: fetch инжектируется.

// Адрес статуса: /api/order  →  /api/order/<id>
export function buildStatusUrl(apiUrl, id) {
  if (!apiUrl) return null
  return `${apiUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`
}

// Адрес отмены: /api/order  →  /api/order/<id>/cancel
export function buildCancelUrl(apiUrl, id) {
  if (!apiUrl) return null
  return `${apiUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}/cancel`
}

// Отмена брони клиентом. Возвращает { ok: true } либо { ok: false, reason, status? }.
export async function requestCancel(apiUrl, id, phone, fetchImpl = fetch) {
  const url = buildCancelUrl(apiUrl, id)
  if (!url) return { ok: false, reason: 'not-configured' }
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.error || 'api-error', status: data.status }
    }
    return { ok: true, status: data.status || 'cancelled' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

// Статус заказа по номеру. Возвращает { ok: true, status } либо { ok: false, reason }.
export async function requestStatus(apiUrl, id, fetchImpl = fetch) {
  const url = buildStatusUrl(apiUrl, id)
  if (!url) return { ok: false, reason: 'not-configured' }
  try {
    const res = await fetchImpl(url)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return { ok: false, reason: data.error || 'api-error' }
    return { ok: true, status: data.status, holdUntil: data.holdUntil }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

// Отправка заказа. Возвращает { ok: true, id } либо { ok: false, reason }.
export async function requestOrder(apiUrl, order, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.error || 'api-error' }
    }
    return { ok: true, id: data.id, holdUntil: data.holdUntil }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
