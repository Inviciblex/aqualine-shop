// Чистая логика источника каталога (без import.meta/React/fetch) — для тестов.
import { optimizeImages } from './image-url.js'

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
