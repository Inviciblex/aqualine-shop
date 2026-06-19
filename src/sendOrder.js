/**
 * Отправка заказа на бэкенд (папка server/). Фронтенд не знает токен Telegram.
 * Бэкенд сохраняет заказ в БД, шлёт в Telegram и возвращает номер заказа.
 *
 * Адрес задаётся в .env: VITE_ORDER_API_URL (например, /api/order).
 */

const API_URL = import.meta.env.VITE_ORDER_API_URL

export function isOrderApiConfigured() {
  return Boolean(API_URL)
}

// Адрес для проверки статуса заказа: /api/order  →  /api/order/<id>
export function statusUrl(id) {
  if (!API_URL) return null
  return `${API_URL.replace(/\/$/, '')}/${encodeURIComponent(id)}`
}

/**
 * Отправляет заказ. Возвращает:
 *   { ok: true, id }            — успех, id — номер заказа от бэкенда
 *   { ok: false, reason }       — ошибка ('not-configured' = демо-режим)
 */
export async function sendOrder(order) {
  if (!isOrderApiConfigured()) {
    console.warn('VITE_ORDER_API_URL не задан. Заказ (демо-режим):', order)
    // В демо-режиме генерируем номер локально, чтобы UI работал.
    return { ok: true, id: 'AQ-DEMO-' + Date.now().toString().slice(-4), demo: true }
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      console.error('Ответ бэкенда:', res.status, data)
      return { ok: false, reason: data.error || 'api-error' }
    }
    return { ok: true, id: data.id }
  } catch (e) {
    console.error('Сеть/бэкенд:', e)
    return { ok: false, reason: 'network' }
  }
}
