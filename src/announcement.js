/**
 * Объявление-баннер магазина. Текст задаёт владелец в админке (/admin),
 * сервер хранит его в sqlite и отдаёт по GET /api/announcement.
 *
 * Адрес выводим из VITE_ORDER_API_URL (напр. /api/order → /api/announcement),
 * чтобы не заводить отдельную переменную. Без бэкенда (демо-режим) баннера нет.
 */

const API_URL = import.meta.env.VITE_ORDER_API_URL

// /api/order → /api/announcement (меняем последний сегмент пути).
export function announcementUrl() {
  if (!API_URL) return null
  return API_URL.replace(/\/[^/]*$/, '/announcement')
}

/**
 * Возвращает активное объявление или null (выключено / нет бэкенда / ошибка).
 *   { message, level: 'info'|'warn', id }  — id служит «версией» для закрытия.
 * Тихо глотаем любые ошибки: баннер второстепенен, ронять из-за него UI нельзя.
 */
export async function fetchAnnouncement() {
  const url = announcementUrl()
  if (!url) return null
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !data.active || !data.message) return null
    return {
      message: String(data.message),
      level: data.level === 'warn' ? 'warn' : 'info',
      // Версия объявления: при смене текста updatedAt меняется, и закрытая ранее
      // плашка показывается снова. Фолбэк на текст — если сервер не прислал дату.
      id: String(data.updatedAt || data.message),
    }
  } catch {
    return null
  }
}
