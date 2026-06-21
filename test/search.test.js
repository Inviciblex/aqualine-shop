// Тесты умного поиска (src/search.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesQuery, levenshtein, searchableText } from '../src/search.js'

test('пустой запрос подходит всем', () => {
  assert.equal(matchesQuery('Смеситель', ''), true)
  assert.equal(matchesQuery('Смеситель', '   '), true)
})

test('обычное вхождение и регистр/ё', () => {
  assert.equal(matchesQuery('Смеситель для кухни', 'смеситель'), true)
  assert.equal(matchesQuery('Смеситель для кухни', 'КУХНИ'), true)
  assert.equal(matchesQuery('Тёплый дом', 'теплый'), true)
})

test('не та раскладка: латиница на клавишах русского слова', () => {
  // cvtcbntkm на QWERTY = смеситель на ЙЦУКЕН
  assert.equal(matchesQuery('Смеситель для кухни', 'cvtcbntkm'), true)
})

test('транслит латиницей', () => {
  assert.equal(matchesQuery('Раковина накладная', 'rakovina'), true)
  assert.equal(matchesQuery('Бренд Аквалин', 'akvalin'), true)
  assert.equal(matchesQuery('Душевая система', 'dushevaya'), true)
})

test('опечатки в пределах допуска', () => {
  assert.equal(matchesQuery('Смеситель', 'смеситль'), true) // пропущена буква
  assert.equal(matchesQuery('Раковина', 'ракавина'), true) // одна замена
})

test('нерелевантный запрос не подходит', () => {
  assert.equal(matchesQuery('Смеситель для кухни', 'унитаз'), false)
  assert.equal(matchesQuery('Раковина', 'ванна'), false)
})

test('несколько слов: все должны найтись', () => {
  assert.equal(matchesQuery('Смеситель для кухни «Поток»', 'смеситель поток'), true)
  assert.equal(matchesQuery('Смеситель для кухни «Поток»', 'смеситель ванна'), false)
})

test('levenshtein: базовые случаи и ранний выход', () => {
  assert.equal(levenshtein('кот', 'кот'), 0)
  assert.equal(levenshtein('кот', 'код'), 1)
  assert.equal(levenshtein('abc', 'abcdef', 1), 2) // превышен лимит → limit+1
})

test('searchableText собирает имя, описание, артикул, бренд', () => {
  const t = searchableText({ name: 'A', description: 'B', sku: 'C', brand: 'D' })
  assert.equal(t, 'A B C D')
  assert.equal(searchableText({ name: 'A' }), 'A')
})
