// Тесты чистой логики источника каталога (src/catalog-source.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveImgProvider,
  withOptimizedImages,
  normalizeJson,
  resolveCatalog,
} from '../src/catalog-source.js'

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

const SHEET = { products: [{ sku: 'sheet' }], categories: [] }
const JSON_SNAP = { products: [{ sku: 'json' }], categories: [] }

test('resolveCatalog: без адреса таблицы → грузим из products.json', async () => {
  let sheetCalled = false
  const out = await resolveCatalog({
    sheetUrl: '',
    loadSheet: async () => {
      sheetCalled = true
      return SHEET
    },
    loadJson: async () => JSON_SNAP,
  })
  assert.equal(out.products[0].sku, 'json')
  assert.equal(sheetCalled, false) // таблицу даже не трогаем
})

test('resolveCatalog: таблица задана и отвечает → берём таблицу', async () => {
  let jsonCalled = false
  const out = await resolveCatalog({
    sheetUrl: 'https://sheet',
    loadSheet: async () => SHEET,
    loadJson: async () => {
      jsonCalled = true
      return JSON_SNAP
    },
  })
  assert.equal(out.products[0].sku, 'sheet')
  assert.equal(jsonCalled, false) // фолбэк не нужен
})

test('resolveCatalog: таблица упала → откат на products.json + предупреждение', async () => {
  let warned = false
  const out = await resolveCatalog({
    sheetUrl: 'https://sheet',
    loadSheet: async () => {
      throw new Error('sheet-timeout')
    },
    loadJson: async () => JSON_SNAP,
    warn: () => {
      warned = true
    },
  })
  assert.equal(out.products[0].sku, 'json')
  assert.equal(warned, true)
})

test('resolveCatalog: упали оба источника → пробрасываем ошибку', async () => {
  await assert.rejects(
    resolveCatalog({
      sheetUrl: 'https://sheet',
      loadSheet: async () => {
        throw new Error('sheet-down')
      },
      loadJson: async () => {
        throw new Error('json-down')
      },
    }),
    /json-down/,
  )
})
