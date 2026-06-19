// Чистая логика обращения к бэкенду заказов. Вынесено из sendOrder.js (без
// import.meta.env), чтобы покрыть тестами: fetch инжектируется.

// Адрес статуса: /api/order  →  /api/order/<id>
export function buildStatusUrl(apiUrl, id) {
  if (!apiUrl) return null
  return `${apiUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`
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
    return { ok: true, id: data.id }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
