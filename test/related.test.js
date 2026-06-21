// Тесты подбора сопутствующих товаров (src/related.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relatedProducts } from '../src/related.js'

const CATALOG = [
  { id: 1, name: 'Смеситель A', category: 'Смесители', inStock: true },
  { id: 2, name: 'Раковина B', category: 'Раковины', inStock: false },
  { id: 3, name: 'Раковина C', category: 'Раковины', inStock: true },
  { id: 4, name: 'Душ D', category: 'Душевые системы', inStock: true },
  { id: 5, name: 'Фитинги E', category: 'Трубы и фитинги', inStock: true },
]

test('ручной related: по id, в заданном порядке, только существующие', () => {
  const product = { id: 1, category: 'Смесители', related: [3, 99, 4] }
  const res = relatedProducts(product, CATALOG)
  assert.deepEqual(
    res.map((p) => p.id),
    [3, 4],
  )
})

test('ручной related не включает сам товар', () => {
  const product = { id: 1, category: 'Смесители', related: [1, 3] }
  assert.deepEqual(
    relatedProducts(product, CATALOG).map((p) => p.id),
    [3],
  )
})

test('без related: эвристика по дополняющим категориям, в наличии — выше', () => {
  const product = { id: 1, category: 'Смесители' } // дополняют: Раковины, Душевые
  const res = relatedProducts(product, CATALOG)
  // Раковина C (в наличии) выше Раковины B (нет), плюс Душ D.
  assert.deepEqual(
    res.map((p) => p.id),
    [3, 4, 2],
  )
})

test('limit ограничивает количество', () => {
  const product = { id: 1, category: 'Смесители' }
  assert.equal(relatedProducts(product, CATALOG, 1).length, 1)
})

test('нет дополняющих категорий / нет товара → пустой массив', () => {
  assert.deepEqual(relatedProducts(null, CATALOG), [])
  assert.deepEqual(relatedProducts({ id: 9, category: 'Неизвестно' }, CATALOG), [])
})
