// Хранилище избранного (id товаров) в localStorage. Чистая логика вынесена
// отдельно для тестируемости; storage инжектируется.
const KEY = 'aqualine_favorites_v1'

export function loadFavorites(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'number') : []
  } catch {
    return []
  }
}

export function saveFavorites(ids, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(ids))
  } catch {
    // приватный режим — игнорируем
  }
}

// Переключение: добавляет id, если его нет, иначе убирает. Возвращает новый массив.
export function toggleId(ids, id) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

// Убирает id из списка (если он там был). Возвращает новый массив.
export function removeIds(ids, idsToRemove) {
  const set = new Set(idsToRemove)
  return ids.filter((x) => !set.has(x))
}
