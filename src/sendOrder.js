/**
 * Отправка заказа на бэкенд (папка server/). Фронтенд не знает токен Telegram.
 * Бэкенд сохраняет заказ в БД, шлёт в Telegram и возвращает номер заказа.
 *
 * Адрес задаётся в .env: VITE_ORDER_API_URL (например, /api/order).
 */

import { buildStatusUrl, requestOrder, requestCancel } from './order-api.js'

const API_URL = import.meta.env.VITE_ORDER_API_URL

export function isOrderApiConfigured() {
  return Boolean(API_URL)
}

// Адрес для проверки статуса заказа: /api/order  →  /api/order/<id>
export function statusUrl(id) {
  return buildStatusUrl(API_URL, id)
}

// Отмена брони клиентом (нужно совпадение телефона на сервере).
export function cancelOrder(id, phone) {
  return requestCancel(API_URL, id, phone)
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
  return requestOrder(API_URL, order)
}
