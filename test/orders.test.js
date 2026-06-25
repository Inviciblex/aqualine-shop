// Тесты истории заказов на устройстве (src/orders.js). localStorage —
// in-memory мок (orders.js читает его лениво, внутри функций).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

function makeLocalStorage() {
  let store = {}
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    removeItem: (k) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  }
}

const KEY = 'aqualine_orders_v1'
let orders

beforeEach(async () => {
  globalThis.localStorage = makeLocalStorage()
  orders = await import('../src/orders.js')
})

test('getOrders: пусто → []', () => {
  assert.deepEqual(orders.getOrders(), [])
})

test('saveOrder + getOrders: заказ сохраняется', () => {
  orders.saveOrder({ id: 'AQ-1', status: 'new' })
  const list = orders.getOrders()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'AQ-1')
})

test('saveOrder: новые заказы сверху', () => {
  orders.saveOrder({ id: 'AQ-1' })
  orders.saveOrder({ id: 'AQ-2' })
  assert.deepEqual(
    orders.getOrders().map((o) => o.id),
    ['AQ-2', 'AQ-1'],
  )
})

test('updateOrderStatus: меняет статус нужного заказа', () => {
  orders.saveOrder({ id: 'AQ-1', status: 'new' })
  orders.saveOrder({ id: 'AQ-2', status: 'new' })
  orders.updateOrderStatus('AQ-1', 'done')
  const byId = Object.fromEntries(orders.getOrders().map((o) => [o.id, o.status]))
  assert.equal(byId['AQ-1'], 'done')
  assert.equal(byId['AQ-2'], 'new')
})

test('saveOrder: история ограничена 50 записями', () => {
  for (let i = 0; i < 55; i++) orders.saveOrder({ id: 'AQ-' + i })
  const list = orders.getOrders()
  assert.equal(list.length, 50)
  assert.equal(list[0].id, 'AQ-54') // самый свежий сверху
})

test('getOrders: битые данные в хранилище → []', () => {
  globalThis.localStorage.setItem(KEY, 'не-json')
  assert.deepEqual(orders.getOrders(), [])
})

test('activeOrdersCount: считает только Принят/Подтверждён, без демо', () => {
  orders.saveOrder({ id: 'AQ-1', status: 'new' })
  orders.saveOrder({ id: 'AQ-2', status: 'confirmed' })
  orders.saveOrder({ id: 'AQ-3', status: 'done' })
  orders.saveOrder({ id: 'AQ-4', status: 'cancelled' })
  orders.saveOrder({ id: 'AQ-5', status: 'new', demo: true })
  assert.equal(orders.activeOrdersCount(), 2)
})

test('activeOrdersCount: пусто → 0', () => {
  assert.equal(orders.activeOrdersCount(), 0)
})

test('subscribeOrders: подписчик получает уведомление и отписывается', () => {
  let calls = 0
  const unsub = orders.subscribeOrders(() => {
    calls++
  })
  orders.saveOrder({ id: 'AQ-1', status: 'new' })
  orders.updateOrderStatus('AQ-1', 'done')
  assert.equal(calls, 2)
  unsub()
  orders.saveOrder({ id: 'AQ-2', status: 'new' })
  assert.equal(calls, 2) // после отписки не растёт
})

// now фиксируем параметром, чтобы тест не зависел от текущего времени.
// HOLD_DAYS = 2 (src/store.js).
const NOW = Date.parse('2026-06-25T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()

test('isOverdue: активная бронь старше срока хранения → true', () => {
  assert.equal(orders.isOverdue({ status: 'new', createdAt: daysAgo(3) }, NOW), true)
  assert.equal(orders.isOverdue({ status: 'confirmed', createdAt: daysAgo(3) }, NOW), true)
})

test('isOverdue: свежая активная бронь → false', () => {
  assert.equal(orders.isOverdue({ status: 'new', createdAt: daysAgo(1) }, NOW), false)
})

test('isOverdue: завершённые/отменённые не считаются просроченными', () => {
  assert.equal(orders.isOverdue({ status: 'done', createdAt: daysAgo(10) }, NOW), false)
  assert.equal(orders.isOverdue({ status: 'cancelled', createdAt: daysAgo(10) }, NOW), false)
})

test('isOverdue: null/мусор → false без падения', () => {
  assert.equal(orders.isOverdue(null, NOW), false)
})
