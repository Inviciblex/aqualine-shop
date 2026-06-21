// Чистая логика разбора строки таблицы/CSV в товар. Вынесено из catalog.js
// отдельным модулем (без import.meta/Papa), чтобы покрыть тестами.
//
// images разделяются вертикальной чертой «|»; specs — пары «Название=Значение»,
// тоже через «|».
export function rowToProduct(row, index) {
  const get = (k) => (row[k] ?? '').toString().trim()
  const images = get('images')
    ? get('images')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const specs = get('specs')
    ? get('specs')
        .split('|')
        .map((pair) => {
          const [label, ...rest] = pair.split('=')
          return { label: (label || '').trim(), value: rest.join('=').trim() }
        })
        .filter((s) => s.label)
    : []
  // related: id сопутствующих товаров через «|», напр. «3|7|10».
  const related = get('related')
    ? get('related')
        .split('|')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []
  const inStockRaw = get('inStock').toLowerCase()
  const clearanceRaw = get('clearance').toLowerCase()
  const oldPrice = Number(get('oldPrice').replace(/\s/g, '')) || 0
  return {
    id: Number(get('id')) || index + 1,
    sku: get('sku'),
    name: get('name'),
    category: get('category'),
    brand: get('brand'),
    price: Number(get('price').replace(/\s/g, '')) || 0,
    oldPrice,
    description: get('description'),
    images,
    specs,
    related,
    inStock: ['true', 'да', 'yes', '1', 'в наличии'].includes(inStockRaw),
    clearance: ['true', 'да', 'yes', '1'].includes(clearanceRaw),
  }
}
