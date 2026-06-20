// Тесты хранилища избранного (src/favorites-store.js). storage инжектируется.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadFavorites, saveFavorites, toggleId, removeIds } from '../src/favorites-store.js'

function mockStorage(initial) {
  let v = initial
  return { getItem: () => v, setItem: (_k, val) => { v = String(val) } }
}

test('toggleId: добавляет и убирает id', () => {
  assert.deepEqual(toggleId([], 1), [1])
  assert.deepEqual(toggleId([1, 2], 2), [1])
  assert.deepEqual(toggleId([1], 2), [1, 2])
})

test('removeIds: убирает перечисленные id, остальные сохраняет', () => {
  assert.deepEqual(removeIds([1, 2, 3], [2]), [1, 3])
  assert.deepEqual(removeIds([1, 2, 3], [2, 3, 9]), [1])
  assert.deepEqual(removeIds([1, 2], []), [1, 2])
})

test('loadFavorites: пусто → []', () => {
  assert.deepEqual(loadFavorites(mockStorage(null)), [])
})

test('loadFavorites: оставляет только числовые id', () => {
  assert.deepEqual(loadFavorites(mockStorage(JSON.stringify([1, 'x', 2, null]))), [1, 2])
})

test('loadFavorites: битые данные → []', () => {
  assert.deepEqual(loadFavorites(mockStorage('не-json')), [])
})

test('saveFavorites + loadFavorites: круговая запись/чтение', () => {
  const s = mockStorage(null)
  saveFavorites([3, 7], s)
  assert.deepEqual(loadFavorites(s), [3, 7])
})
