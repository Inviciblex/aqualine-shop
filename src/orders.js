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

// Обновляет статус и (если пришёл с бэкенда) срок хранения. holdUntil мог
// измениться, если менеджер продлил бронь в админке — так покупатель видит
// актуальную дату при обновлении статусов в «Моих бронях».
export function updateOrderStatus(id, status, holdUntil) {
  try {
    const list = getOrders().map((o) =>
      o.id === id ? { ...o, status, ...(holdUntil ? { holdUntil } : {}) } : o,
    )
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

// Момент окончания брони (мс). Берём holdUntil с бэкенда (менеджер мог продлить);
// для старых заказов без него — createdAt + HOLD_DAYS, как раньше.
export function holdUntilMs(order) {
  if (order?.holdUntil) {
    const t = new Date(order.holdUntil).getTime()
    if (Number.isFinite(t)) return t
  }
  return new Date(order?.createdAt).getTime() + HOLD_DAYS * 86_400_000
}

// Бронь просрочена: ещё активна (принята/подтверждена) и срок хранения истёк.
// now передаётся параметром ради тестируемости (по умолчанию — текущее время).
export function isOverdue(order, now = Date.now()) {
  if (!order || !ACTIVE_STATUSES.includes(order.status)) return false
  return now > holdUntilMs(order)
}
