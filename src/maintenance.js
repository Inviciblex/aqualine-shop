/**
 * Режим техработ. Владелец включает его в админке (/admin → «Техработы»),
 * сервер хранит состояние в sqlite и отдаёт по GET /api/maintenance.
 *
 * Адрес выводим из VITE_ORDER_API_URL (напр. /api/order → /api/maintenance),
 * как у объявления. Без бэкенда (демо-режим) плашки нет.
 */

const API_URL = import.meta.env.VITE_ORDER_API_URL

export function maintenanceUrl() {
  if (!API_URL) return null
  return API_URL.replace(/\/[^/]*$/, '/maintenance')
}

/**
 * Возвращает { on, message } (или null, если нет бэкенда/ошибка — тогда сайт
 * работает как обычно). Ошибки глотаем: из-за режима техработ нельзя ронять сайт
 * или случайно закрыть его при недоступном бэкенде.
 */
export async function fetchMaintenance() {
  const url = maintenanceUrl()
  if (!url) return null
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !data.ok) return null
    return { on: Boolean(data.on), message: String(data.message || '') }
  } catch {
    return null
  }
}
