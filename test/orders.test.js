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
