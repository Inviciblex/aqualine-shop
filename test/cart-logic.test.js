// Тесты чистой логики корзины (src/cart-logic.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addToCart, setQtyInCart, removeFromCart, cartTotals } from '../src/cart-logic.js'

const p = (id, price = 100) => ({ id, name: 'Товар ' + id, price })

test('addToCart: новый товар добавляется новой позицией', () => {
  assert.deepEqual(addToCart([], p(1), 2), [{ product: p(1), qty: 2 }])
})

test('addToCart: существующий товар увеличивает количество', () => {
  const r = addToCart([{ product: p(1), qty: 1 }], p(1), 3)
  assert.equal(r.length, 1)
  assert.equal(r[0].qty, 4)
})

test('addToCart: qty меньше 1 приводится к 1', () => {
  assert.equal(addToCart([], p(1), 0)[0].qty, 1)
  assert.equal(addToCart([], p(1), -5)[0].qty, 1)
})

test('addToCart: не мутирует исходный массив', () => {
  const items = [{ product: p(1), qty: 1 }]
  addToCart(items, p(1), 1)
  assert.equal(items[0].qty, 1)
})

test('setQtyInCart: меняет количество позиции', () => {
  assert.equal(setQtyInCart([{ product: p(1), qty: 1 }], 1, 5)[0].qty, 5)
})

test('setQtyInCart: qty <= 0 удаляет позицию', () => {
  assert.deepEqual(setQtyInCart([{ product: p(1), qty: 2 }], 1, 0), [])
})

test('removeFromCart: убирает нужную позицию', () => {
  const r = removeFromCart(
    [
      { product: p(1), qty: 1 },
      { product: p(2), qty: 1 },
    ],
    1,
  )
  assert.deepEqual(
    r.map((i) => i.product.id),
    [2],
  )
})

test('cartTotals: считает количество и сумму', () => {
  const t = cartTotals([
    { product: p(1, 100), qty: 2 },
    { product: p(2, 50), qty: 3 },
  ])
  assert.deepEqual(t, { totalQty: 5, totalSum: 350 })
})

test('cartTotals: пустая корзина → нули', () => {
  assert.deepEqual(cartTotals([]), { totalQty: 0, totalSum: 0 })
})
