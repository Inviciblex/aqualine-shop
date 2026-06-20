// Тесты запоминания контактов покупателя (src/customer.js). storage инжектируется.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCustomer, saveCustomer } from '../src/customer.js'

function mockStorage(initial) {
  let v = initial
  return {
    getItem: () => v,
    setItem: (_k, val) => {
      v = String(val)
    },
  }
}

test('loadCustomer: пусто → {}', () => {
  assert.deepEqual(loadCustomer(mockStorage(null)), {})
})

test('saveCustomer + loadCustomer: круговая', () => {
  const s = mockStorage(null)
  saveCustomer({ name: 'Иван', phone: '+7 (916) 123-45-67', payment: 'cash' }, s)
  assert.deepEqual(loadCustomer(s), {
    name: 'Иван',
    phone: '+7 (916) 123-45-67',
    payment: 'cash',
  })
})

test('saveCustomer: payment по умолчанию card', () => {
  const s = mockStorage(null)
  saveCustomer({ name: 'А', phone: '1' }, s)
  assert.equal(loadCustomer(s).payment, 'card')
})

test('loadCustomer: битые данные → {}', () => {
  assert.deepEqual(loadCustomer(mockStorage('не-json')), {})
})

test('loadCustomer: игнорирует не-строковые поля', () => {
  assert.deepEqual(
    loadCustomer(mockStorage(JSON.stringify({ name: 5, phone: '+7', payment: null }))),
    {
      phone: '+7',
    },
  )
})
