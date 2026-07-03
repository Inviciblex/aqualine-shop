// Чистая логика источника каталога (без import.meta/React/fetch) — для тестов.
import { optimizeImages } from './image-url.js'
import { rowToProduct } from './catalog-parse.js'

// Строки CSV/таблицы → каталог. Общая логика для рантайм-загрузчика (loadFromSheet)
// и билд-скрипта синка снапшота (scripts/sync-catalog.mjs) — чтобы products.json
// получался ровно таким же, каким его строит загрузка из таблицы.
export function sheetRowsToCatalog(rows) {
  const products = (rows || []).map(rowToProduct).filter((p) => p.name && p.sku)
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))]
  return { products, categories }
}

// Нормализация значения VITE_IMG_PROXY в имя провайдера image-proxy.
// Пусто → оптимизация выключена; '1'/'true'/'on' → weserv (единственный сейчас).
export function resolveImgProvider(raw) {
  if (!raw) return ''
  return ['1', 'true', 'on'].includes(String(raw).toLowerCase()) ? 'weserv' : String(raw)
}

// Прогоняет фото всех товаров через image-proxy (если провайдер задан).
export function withOptimizedImages(result, provider) {
  if (!provider) return result
  return {
    ...result,
    products: (result.products || []).map((p) => ({
      ...p,
      images: optimizeImages(p.images, { provider }),
    })),
  }
}

// Выбор источника каталога с фолбэком. Если задан адрес Google-таблицы —
// пробуем её, но при сбое (сеть/таймаут/Google недоступен) откатываемся на
// снапшот products.json, а не роняем весь магазин в error-state. Загрузчики
// инжектируются (loadSheet/loadJson) — модуль остаётся чистым и тестируемым.
export async function resolveCatalog({ sheetUrl, loadSheet, loadJson, warn = () => {} }) {
  if (!sheetUrl) return loadJson()
  try {
    return await loadSheet()
  } catch (e) {
    warn('Каталог из Google-таблицы недоступен, откат на products.json:', e)
    return loadJson()
  }
}

// Валидация каталога из products.json: отбрасываем битые записи (без name/sku
// или с нечисловой ценой), чтобы мусор не протёк до рендера. Категории берём из
// файла или выводим из товаров. Форму товара (images[]/specs[]) не трогаем.
export function normalizeJson(json) {
  const raw = Array.isArray(json?.products) ? json.products : []
  const products = raw.filter(
    (p) => p && typeof p.name === 'string' && p.name.trim() && p.sku && Number.isFinite(p.price),
  )
  const categories =
    Array.isArray(json?.categories) && json.categories.length
      ? json.categories
      : [...new Set(products.map((p) => p.category).filter(Boolean))]
  return { products, categories }
}
