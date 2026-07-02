// SEO для страницы товара: динамический <title>, meta description, Open Graph,
// каноническая ссылка и структурированные данные JSON-LD (schema.org Product +
// Offer).
//
// С History-роутингом адреса товаров — настоящие URL (/product/3), поэтому
// поисковики индексируют каждый товар отдельной страницей. Здесь под открытый
// маршрут выставляются canonical и og:url на канонический домен (из <link
// rel="canonical"> в index.html), а не на фактический origin (в dev/LAN это мог
// бы быть IP). Query-параметры фильтров в canonical не попадают — отфильтрованные
// выдачи каноникализируются на «/».
import { formatPrice } from './utils.js'

// Значения по умолчанию (для каталога/главной) — совпадают с index.html.
const DEFAULT_TITLE = 'Аквалин — сантехника'
const DEFAULT_DESC =
  'Аквалин — магазин сантехники: смесители, раковины, унитазы, душевые системы и комплектующие. Самовывоз.'

const LD_PRODUCT = 'ld-product'
const LD_BREADCRUMB = 'ld-breadcrumb'

// Дефолтная картинка превью (из index.html) — чтобы вернуть её в resetSeo.
const DEFAULT_OG_IMAGE =
  document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''

// Канонический домен берём из статичного <link rel="canonical"> в index.html
// (одно место, где домен настраивается перед запуском). Если распарсить не
// удалось — падаем на фактический origin.
const CANONICAL_ORIGIN = (() => {
  const href = document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  try {
    return new URL(href).origin
  } catch {
    return typeof window !== 'undefined' ? window.location.origin : ''
  }
})()

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

// Канонический адрес текущего маршрута: домен из конфигурации + путь (без query,
// чтобы фильтры не плодили дубликаты). Обновляет и <link rel="canonical">, и og:url.
function setCanonicalUrl() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  const url = CANONICAL_ORIGIN + path
  setMeta('link[rel="canonical"]', 'href', url)
  setMeta('meta[property="og:url"]', 'content', url)
}

// Краткое описание для мета-тега: режем до ~160 символов по границе слова.
function clip(text, max = 160) {
  const s = (text || '').trim()
  if (s.length <= max) return s
  return s.slice(0, s.lastIndexOf(' ', max) || max).trim() + '…'
}

function removeLd(id) {
  const el = document.getElementById(id)
  if (el) el.remove()
}
function removeAllLd() {
  removeLd(LD_PRODUCT)
  removeLd(LD_BREADCRUMB)
}
// Вставляет/заменяет один блок JSON-LD по id.
function setLd(id, obj) {
  removeLd(id)
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = id
  script.textContent = JSON.stringify(obj)
  document.head.appendChild(script)
}

// Устанавливает SEO под конкретный товар.
export function setProductSeo(product) {
  if (!product) return
  const title = `${product.name} — Аквалин`
  const desc = clip(product.description) || DEFAULT_DESC
  document.title = title
  setMeta('meta[name="description"]', 'content', desc)
  setMeta('meta[property="og:title"]', 'content', title)
  setMeta('meta[property="og:description"]', 'content', desc)
  setMeta('meta[name="twitter:title"]', 'content', title)
  setMeta('meta[name="twitter:description"]', 'content', desc)
  // Превью-картинка и адрес страницы — чтобы ссылка на товар в Telegram/WhatsApp
  // раскрывалась с фото. Первое фото уже абсолютный URL (внешний/через прокси).
  const image = product.images && product.images.length ? product.images[0] : DEFAULT_OG_IMAGE
  if (image) {
    setMeta('meta[property="og:image"]', 'content', image)
    setMeta('meta[name="twitter:image"]', 'content', image)
  }
  setCanonicalUrl()

  // JSON-LD Product + Offer.
  const offer = {
    '@type': 'Offer',
    price: product.price,
    priceCurrency: 'RUB',
    availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
    itemCondition: product.clearance
      ? 'https://schema.org/UsedCondition'
      : 'https://schema.org/NewCondition',
    // Цена указана в рублях с учётом самовывоза; описание — в человекочитаемом виде.
    description: `${formatPrice(product.price)} · самовывоз`,
  }
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    description: product.description || undefined,
    category: product.category || undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    image: product.images && product.images.length ? product.images : undefined,
    offers: offer,
  }

  setLd(LD_PRODUCT, ld)

  // Хлебные крошки: Каталог → Категория → Товар. Даёт rich-result с навигацией в
  // выдаче и повторяет крошки на самой странице товара.
  const trail = [{ name: 'Каталог', item: CANONICAL_ORIGIN + '/' }]
  if (product.category) {
    trail.push({
      name: product.category,
      item: `${CANONICAL_ORIGIN}/?cat=${encodeURIComponent(product.category)}`,
    })
  }
  trail.push({ name: product.name, item: `${CANONICAL_ORIGIN}/product/${product.id}` })
  setLd(LD_BREADCRUMB, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  })
}

// Возвращает мета-теги к значениям каталога/главной. Можно передать заголовок и
// описание раздела ({ title, description }) — иначе берутся дефолты главной. Так у
// каждого раздела свои уникальные title/description, а не дубли главной страницы.
export function resetSeo({ title, description } = {}) {
  const t = title || DEFAULT_TITLE
  const d = description || DEFAULT_DESC
  document.title = t
  setMeta('meta[name="description"]', 'content', d)
  setMeta('meta[property="og:title"]', 'content', t)
  setMeta('meta[property="og:description"]', 'content', d)
  setMeta('meta[name="twitter:title"]', 'content', t)
  setMeta('meta[name="twitter:description"]', 'content', d)
  if (DEFAULT_OG_IMAGE) {
    setMeta('meta[property="og:image"]', 'content', DEFAULT_OG_IMAGE)
    setMeta('meta[name="twitter:image"]', 'content', DEFAULT_OG_IMAGE)
  }
  setCanonicalUrl()
  removeAllLd()
}
