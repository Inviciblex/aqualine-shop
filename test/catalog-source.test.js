// Тесты чистой логики источника каталога (src/catalog-source.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveImgProvider, withOptimizedImages, normalizeJson } from '../src/catalog-source.js'

test('resolveImgProvider: пусто → выключено', () => {
  assert.equal(resolveImgProvider(''), '')
  assert.equal(resolveImgProvider(undefined), '')
})

test('resolveImgProvider: 1/true/on → weserv, иначе как есть', () => {
  assert.equal(resolveImgProvider('1'), 'weserv')
  assert.equal(resolveImgProvider('true'), 'weserv')
  assert.equal(resolveImgProvider('ON'), 'weserv')
  assert.equal(resolveImgProvider('weserv'), 'weserv')
})

test('withOptimizedImages: без провайдера — результат без изменений', () => {
  const result = { products: [{ id: 1, images: ['https://s/1.jpg'] }], categories: [] }
  assert.equal(withOptimizedImages(result, ''), result)
})

test('withOptimizedImages: с провайдером — фото проксируются', () => {
  const result = { products: [{ id: 1, images: ['https://s/1.jpg'] }], categories: [] }
  const out = withOptimizedImages(result, 'weserv')
  assert.ok(out.products[0].images[0].startsWith('https://images.weserv.nl/'))
  assert.notEqual(out, result) // не мутирует исходный
})

test('normalizeJson: отбрасывает битые записи (без name/sku/цены)', () => {
  const json = {
    products: [
      { id: 1, name: 'Смеситель', sku: 'S1', price: 4990 },
      { id: 2, name: '', sku: 'S2', price: 100 }, // нет имени
      { id: 3, name: 'X', sku: '', price: 100 }, // нет sku
      { id: 4, name: 'Y', sku: 'S4', price: 'дорого' }, // цена не число
      null,
    ],
  }
  const out = normalizeJson(json)
  assert.equal(out.products.length, 1)
  assert.equal(out.products[0].sku, 'S1')
})

test('normalizeJson: категории выводятся из товаров, если не заданы', () => {
  const json = {
    products: [
      { name: 'A', sku: 'a', price: 1, category: 'Смесители' },
      { name: 'B', sku: 'b', price: 2, category: 'Раковины' },
      { name: 'C', sku: 'c', price: 3, category: 'Смесители' },
    ],
  }
  assert.deepEqual(normalizeJson(json).categories, ['Смесители', 'Раковины'])
})

test('normalizeJson: явные категории сохраняются; мусорный вход → пусто', () => {
  assert.deepEqual(normalizeJson({ products: [], categories: ['X'] }).categories, ['X'])
  assert.deepEqual(normalizeJson(null), { products: [], categories: [] })
})
