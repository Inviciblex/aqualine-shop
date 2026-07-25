// Чистая логика товаров для админки: валидация/нормализация, маппинг между
// строкой SQLite и формой API, определение типа картинки по magic-bytes.
// Без внешних зависимостей и без node:sqlite — модуль тестируется в отрыве.

const NAME_MAX = 200
const SKU_MAX = 60
const CAT_MAX = 80
const BRAND_MAX = 80
const DESC_MAX = 4000
const URL_MAX = 500
const SPEC_MAX = 120
const MAX_SPECS = 40
const MAX_IMAGES = 12
const MAX_RELATED = 50
const PRICE_MAX = 10_000_000

// Управляющие C0/DEL-байты (кроме \t \n \r) вырезаем из строк.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const str = (v, max) =>
  typeof v === 'string' ? v.replace(CONTROL_CHARS_RE, '').trim().slice(0, max) : ''

// Допустимая ссылка на фото: свой путь /img/… или /media/… (загруженные в
// админке) либо абсолютный http(s). «..» запрещаем — никаких переходов вверх.
export function isValidImageRef(u) {
  const s = String(u || '').trim()
  if (s.includes('..')) return false
  return /^\/(img|media)\/[\w./-]+$/.test(s) || /^https?:\/\/\S+$/i.test(s)
}

// Проверка и нормализация товара из формы админки. Возвращает { error } или
// { value } с очищенными полями (той же формы, что products.json).
export function validateProduct(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'bad-payload' }

  const name = str(data.name, NAME_MAX)
  if (!name) return { error: 'bad-name' }

  const price = Number(data.price)
  if (!Number.isFinite(price) || price < 0 || price > PRICE_MAX) return { error: 'bad-price' }

  let oldPrice = Number(data.oldPrice)
  if (!Number.isFinite(oldPrice) || oldPrice < 0 || oldPrice > PRICE_MAX) oldPrice = 0

  const images = (Array.isArray(data.images) ? data.images : [])
    .map((u) => str(u, URL_MAX))
    .filter(isValidImageRef)
    .slice(0, MAX_IMAGES)

  const specs = (Array.isArray(data.specs) ? data.specs : [])
    .map((s) => ({ label: str(s?.label, SPEC_MAX), value: str(s?.value, SPEC_MAX) }))
    .filter((s) => s.label)
    .slice(0, MAX_SPECS)

  const related = (Array.isArray(data.related) ? data.related : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_RELATED)

  return {
    value: {
      sku: str(data.sku, SKU_MAX),
      name,
      category: str(data.category, CAT_MAX),
      brand: str(data.brand, BRAND_MAX),
      price: Math.round(price),
      oldPrice: Math.round(oldPrice),
      description: str(data.description, DESC_MAX),
      images,
      specs,
      related,
      inStock: data.inStock === undefined ? true : Boolean(data.inStock),
      clearance: Boolean(data.clearance),
    },
  }
}

const parseJson = (s, fallback) => {
  try {
    const v = JSON.parse(s)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

// Строка SQLite → товар в форме API/products.json.
export function rowToApiProduct(row) {
  return {
    id: row.id,
    sku: row.sku || '',
    name: row.name || '',
    category: row.category || '',
    brand: row.brand || '',
    price: row.price || 0,
    oldPrice: row.old_price || 0,
    description: row.description || '',
    images: parseJson(row.images, []),
    specs: parseJson(row.specs, []),
    related: parseJson(row.related, []),
    inStock: row.in_stock !== 0,
    clearance: row.clearance === 1,
  }
}

// Нормализованный товар (из validateProduct) → набор колонок для INSERT/UPDATE.
export function productToColumns(v) {
  return {
    sku: v.sku,
    name: v.name,
    category: v.category,
    brand: v.brand,
    price: v.price,
    old_price: v.oldPrice,
    description: v.description,
    images: JSON.stringify(v.images),
    specs: JSON.stringify(v.specs),
    related: JSON.stringify(v.related),
    in_stock: v.inStock ? 1 : 0,
    clearance: v.clearance ? 1 : 0,
  }
}

// Определение типа изображения по сигнатуре (magic-bytes). Не доверяем
// Content-Type/имени файла от клиента — только байтам. null → не картинка.
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  // WEBP: 'RIFF'....'WEBP'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'webp'
  return null
}

export const IMAGE_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' }
