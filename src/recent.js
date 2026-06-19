// «Недавно просмотренные» — список id товаров на устройстве (localStorage).
const KEY = 'aqualine_recent_v1'
const MAX = 8

export function getRecent() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addRecent(id) {
  try {
    const list = getRecent().filter((x) => x !== id)
    list.unshift(id)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {}
}
