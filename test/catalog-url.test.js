// Тесты сериализации фильтров каталога в адрес и обратно (src/catalog-url.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFilters, buildCatalogHash } from '../src/catalog-url.js'

test('parseFilters: пустой хеш → значения по умолчанию', () => {
  assert.deepEqual(parseFilters('#/'), {
    query: '',
    categories: [],
    brands: [],
    priceMin: null,
    priceLimit: null,
    inStockOnly: false,
    sort: 'default',
  })
})

test('parseFilters: читает все параметры', () => {
  const f = parseFilters(
    '#/?q=кран&cat=Смесители,Раковины&brand=Аквалин&min=1000&max=5000&stock=1&sort=price-asc',
  )
  assert.equal(f.query, 'кран')
  assert.deepEqual(f.categories, ['Смесители', 'Раковины'])
  assert.deepEqual(f.brands, ['Аквалин'])
  assert.equal(f.priceMin, 1000)
  assert.equal(f.priceLimit, 5000)
  assert.equal(f.inStockOnly, true)
  assert.equal(f.sort, 'price-asc')
})

test('parseFilters: мусорные числа → null', () => {
  const f = parseFilters('#/?min=abc')
  assert.equal(f.priceMin, null)
})

test('buildCatalogHash: пустые фильтры → "#/"', () => {
  assert.equal(buildCatalogHash({}), '#/')
})

test('buildCatalogHash: дефолтная сортировка и выключенное наличие не пишутся', () => {
  assert.equal(buildCatalogHash({ sort: 'default', inStockOnly: false }), '#/')
})

test('buildCatalogHash: цены, равные границам каталога, не пишутся', () => {
  const h = buildCatalogHash({ priceMin: 100, priceLimit: 5000 }, { minPrice: 100, maxPrice: 5000 })
  assert.equal(h, '#/')
})

test('buildCatalogHash: суженный диапазон цен пишется', () => {
  const h = buildCatalogHash(
    { priceMin: 1000, priceLimit: 4000 },
    { minPrice: 100, maxPrice: 5000 },
  )
  assert.match(h, /min=1000/)
  assert.match(h, /max=4000/)
})

test('round-trip: build → parse сохраняет фильтры', () => {
  const filters = {
    query: 'кран',
    categories: ['Смесители'],
    brands: ['Аквалин', 'АкваПро'],
    priceMin: 1000,
    priceLimit: 4000,
    inStockOnly: true,
    sort: 'price-desc',
  }
  const parsed = parseFilters(buildCatalogHash(filters, { minPrice: 0, maxPrice: 10000 }))
  assert.deepEqual(parsed, filters)
})
