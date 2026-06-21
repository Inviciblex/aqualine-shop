// Тесты разбора строки таблицы в товар (src/catalog-parse.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToProduct } from '../src/catalog-parse.js'

test('базовые поля строки → товар', () => {
  const p = rowToProduct(
    {
      id: '5',
      sku: 'AQ-1',
      name: 'Смеситель',
      category: 'Смесители',
      brand: 'АкваПро',
      price: '4990',
      description: 'Описание',
    },
    0,
  )
  assert.equal(p.id, 5)
  assert.equal(p.sku, 'AQ-1')
  assert.equal(p.name, 'Смеситель')
  assert.equal(p.category, 'Смесители')
  assert.equal(p.brand, 'АкваПро')
  assert.equal(p.price, 4990)
  assert.equal(p.description, 'Описание')
})

test('brand: отсутствует → пустая строка', () => {
  assert.equal(rowToProduct({ name: 'X' }, 0).brand, '')
})

test('id по умолчанию = index + 1, если не задан', () => {
  assert.equal(rowToProduct({ name: 'X' }, 0).id, 1)
  assert.equal(rowToProduct({ name: 'X' }, 4).id, 5)
})

test('цена и oldPrice: пробелы как разделитель разрядов убираются', () => {
  const p = rowToProduct({ price: '4 990', oldPrice: '6 490' }, 0)
  assert.equal(p.price, 4990)
  assert.equal(p.oldPrice, 6490)
})

test('images: разбивка по «|», обрезка и отсев пустых', () => {
  const p = rowToProduct({ images: ' a.jpg | b.jpg ||  c.jpg ' }, 0)
  assert.deepEqual(p.images, ['a.jpg', 'b.jpg', 'c.jpg'])
  assert.deepEqual(rowToProduct({}, 0).images, [])
})

test('specs: пары «Название=Значение», = в значении сохраняется', () => {
  const p = rowToProduct({ specs: 'Материал=Латунь | Резьба=1/2"=DN15 | =пусто' }, 0)
  assert.deepEqual(p.specs, [
    { label: 'Материал', value: 'Латунь' },
    { label: 'Резьба', value: '1/2"=DN15' },
  ]) // пара без названия отсеивается
})

test('inStock: распознаёт да/true/yes/1/«в наличии», иначе false', () => {
  for (const v of ['да', 'true', 'YES', '1', 'в наличии']) {
    assert.equal(rowToProduct({ inStock: v }, 0).inStock, true, `«${v}» → true`)
  }
  for (const v of ['нет', 'false', '', '0']) {
    assert.equal(rowToProduct({ inStock: v }, 0).inStock, false, `«${v}» → false`)
  }
})

test('clearance: да/true/yes/1 → true', () => {
  assert.equal(rowToProduct({ clearance: 'да' }, 0).clearance, true)
  assert.equal(rowToProduct({ clearance: 'нет' }, 0).clearance, false)
})

test('пустая строка не падает', () => {
  const p = rowToProduct({}, 0)
  assert.equal(p.price, 0)
  assert.equal(p.sku, '')
  assert.deepEqual(p.specs, [])
})
