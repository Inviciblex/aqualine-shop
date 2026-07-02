// Тесты сопоставления пути с маршрутом (src/routes.js) — чистая функция без DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRoute } from '../src/routes.js'

test('корень и неизвестный путь → каталог', () => {
  assert.deepEqual(matchRoute('/'), { name: 'catalog' })
  assert.deepEqual(matchRoute(''), { name: 'catalog' })
  assert.deepEqual(matchRoute('/unknown/path'), { name: 'catalog' })
})

test('/product/<id> → товар с числовым id', () => {
  assert.deepEqual(matchRoute('/product/3'), { name: 'product', id: 3 })
  assert.deepEqual(matchRoute('/product/42'), { name: 'product', id: 42 })
})

test('/product без числового id → каталог (не товар)', () => {
  assert.deepEqual(matchRoute('/product/abc'), { name: 'catalog' })
  assert.deepEqual(matchRoute('/product/'), { name: 'catalog' })
  assert.deepEqual(matchRoute('/product'), { name: 'catalog' })
})

test('статические разделы', () => {
  assert.deepEqual(matchRoute('/orders'), { name: 'orders' })
  assert.deepEqual(matchRoute('/favorites'), { name: 'favorites' })
  assert.deepEqual(matchRoute('/contacts'), { name: 'contacts' })
  assert.deepEqual(matchRoute('/privacy'), { name: 'privacy' })
  assert.deepEqual(matchRoute('/warranty'), { name: 'warranty' })
  assert.deepEqual(matchRoute('/returns'), { name: 'returns' })
  assert.deepEqual(matchRoute('/guides'), { name: 'guides' })
})

test('хвостовой слэш игнорируется', () => {
  assert.deepEqual(matchRoute('/orders/'), { name: 'orders' })
  assert.deepEqual(matchRoute('/product/7/'), { name: 'product', id: 7 })
})
