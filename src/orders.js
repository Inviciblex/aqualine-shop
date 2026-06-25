/**
 * История заказов покупателя — хранится на устройстве (localStorage).
 * Без регистрации: каждый оформленный заказ запоминается в браузере, чтобы
 * человек мог увидеть свои прошлые заказы и их актуальный статус.
 */

import { HOLD_DAYS } from './store.js'

const KEY = 'aqualine_orders_v1'

// Лёгкий pub/sub, чтобы шапка обновляла бейдж активных броней без перезагрузки
// (заказ оформлен / статус подтянулся с бэкенда). Без window — работает и в тестах.
const listeners = new Set()
function emit() {
  for (const fn of listeners) fn()
}
export function subscribeOrders(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getOrders() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveOrder(order) {
  try {
    const list = getOrders()
    list.unshift(order) // новые сверху
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)))
    emit()
  } catch {
    // приватный режим — игнорируем
  }
}

export function updateOrderStatus(id, status) {
  try {
    const list = getOrders().map((o) => (o.id === id ? { ...o, status } : o))
    localStorage.setItem(KEY, JSON.stringify(list))
    emit()
  } catch {}
}

// Человекочитаемые статусы
export const STATUS_LABELS = {
  new: 'Принят',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
}

// «Активные» брони — те, что ждут действия: приняты или подтверждены
// (в отличие от выполненных/отменённых). Демо-заказы не считаем.
export const ACTIVE_STATUSES = ['new', 'confirmed']

export function activeOrdersCount() {
  return getOrders().filter((o) => !o.demo && ACTIVE_STATUSES.includes(o.status)).length
}

// Бронь просрочена: ещё активна (принята/подтверждена) и с момента оформления
// прошло больше срока хранения (HOLD_DAYS). now передаётся параметром ради
// тестируемости (по умолчанию — текущее время).
export function isOverdue(order, now = Date.now()) {
  if (!order || !ACTIVE_STATUSES.includes(order.status)) return false
  const ageDays = (now - new Date(order.createdAt).getTime()) / 86_400_000
  return ageDays > HOLD_DAYS
}
