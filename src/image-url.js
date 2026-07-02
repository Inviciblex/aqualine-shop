// Оптимизация фото товаров через image-proxy (по умолчанию images.weserv.nl):
// ресайз до 1200×900, центр-кроп под 4:3 и конвертация в WebP — на лету, без
// бэкенда и хранилища. Включается переменной VITE_IMG_PROXY (см. catalog.js).
// Здесь только чистая логика построения URL — покрыта тестами.

const PROVIDERS = {
  // images.weserv.nl: бесплатный ресайзер. url кодируется целиком (со схемой).
  // fit=inside вписывает фото в рамку w×h БЕЗ кропа и сохраняет пропорции —
  // квадратные исходники не обрезаются (в вёрстке они центрируются с полями
  // через object-fit: contain). we = не увеличивать мелкие. output=webp.
  weserv: (src, { width, height, quality }) =>
    `https://images.weserv.nl/?url=${encodeURIComponent(src)}` +
    `&w=${width}&h=${height}&fit=inside&we&output=webp&q=${quality}`,
}

const DEFAULTS = { provider: 'weserv', width: 1200, height: 1200, quality: 82 }

// Оборачивает один URL в прокси. Возвращает исходный, если оптимизировать
// нельзя или не нужно: пустая строка, не-абсолютный/не-http(s) адрес (data:,
// blob:, относительный), неизвестный провайдер или уже проксированный URL.
export function optimizeImageUrl(url, opts = {}) {
  const { provider, width, height, quality } = { ...DEFAULTS, ...opts }
  const src = (url || '').toString().trim()
  if (!src) return src
  if (!/^https?:\/\//i.test(src)) return src
  if (src.includes('images.weserv.nl')) return src
  const build = PROVIDERS[provider]
  if (!build) return src
  return build(src, { width, height, quality })
}

// Прогоняет массив ссылок на фото через optimizeImageUrl.
export function optimizeImages(images, opts) {
  if (!Array.isArray(images)) return images
  return images.map((u) => optimizeImageUrl(u, opts))
}

// Достаёт исходный URL из проксированного (images.weserv.nl/?url=<original>).
// Нужен для onError-фолбэка: если прокси недоступен, показываем оригинал.
// Возвращает null, если это не наш прокси-URL.
export function originalFromProxy(url) {
  const src = (url || '').toString()
  if (!src.includes('images.weserv.nl')) return null
  const q = src.indexOf('?')
  if (q === -1) return null
  const params = new URLSearchParams(src.slice(q + 1))
  const orig = params.get('url')
  return orig || null
}

// onError для <img>: если проксированное фото не загрузилось (прокси недоступен/
// лимит), один раз подставляем исходный URL — деградируем мягко, а не битой
// картинкой. Навешивается как onError={onProxyImgError}.
export function onProxyImgError(event) {
  const el = event?.currentTarget
  if (!el || el.dataset.proxyFallback) return
  const orig = originalFromProxy(el.src)
  if (orig) {
    el.dataset.proxyFallback = '1'
    el.src = orig
  }
}
