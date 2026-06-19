/**
 * История заказов покупателя — хранится на устройстве (localStorage).
 * Без регистрации: каждый оформленный заказ запоминается в браузере, чтобы
 * человек мог увидеть свои прошлые заказы и их актуальный статус.
 */

const KEY = 'aqualine_orders_v1'

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
  } catch {
    // приватный режим — игнорируем
  }
}

export function updateOrderStatus(id, status) {
  try {
    const list = getOrders().map((o) => (o.id === id ? { ...o, status } : o))
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

// Человекочитаемые статусы
export const STATUS_LABELS = {
  new: 'Принят',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
}
