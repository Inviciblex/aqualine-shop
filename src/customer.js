// Запоминание контактных данных покупателя на устройстве, чтобы при
// следующем заказе имя/телефон/способ оплаты подставлялись автоматически.
// storage инжектируется для тестов.
const KEY = 'aqualine_customer_v1'

export function loadCustomer(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY)
    const c = raw ? JSON.parse(raw) : null
    if (!c || typeof c !== 'object') return {}
    const out = {}
    if (typeof c.name === 'string') out.name = c.name
    if (typeof c.phone === 'string') out.phone = c.phone
    if (typeof c.payment === 'string') out.payment = c.payment
    return out
  } catch {
    return {}
  }
}

export function saveCustomer(data, storage = globalThis.localStorage) {
  try {
    storage?.setItem(
      KEY,
      JSON.stringify({
        name: data.name || '',
        phone: data.phone || '',
        payment: data.payment || 'card',
      }),
    )
  } catch {
    // приватный режим — игнорируем
  }
}
