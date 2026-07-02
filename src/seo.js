// SEO для страницы товара: динамический <title>, meta description, Open Graph
// и структурированные данные JSON-LD (schema.org Product + Offer).
//
// ВАЖНО про hash-роутинг: адреса товаров вида #/product/3 поисковики не
// индексируют как отдельные страницы (фрагмент после # не учитывается). Поэтому
// JSON-LD и мета-теги здесь работают прежде всего для красивого превью при
// шеринге ссылки и для той страницы, что реально открыта. Чтобы каждый товар
// попадал в поиск отдельной карточкой, нужен History-роутинг (настоящие URL) —
// см. README, раздел про SEO.
import { formatPrice } from './utils.js'

// Значения по умолчанию (для каталога/главной) — совпадают с index.html.
const DEFAULT_TITLE = 'Аквалин — сантехника'
const DEFAULT_DESC =
  'Аквалин — магазин сантехники: смесители, раковины, унитазы, душевые системы и комплектующие. Самовывоз.'

const LD_ID = 'ld-product'

// Дефолтная картинка превью (из index.html) — чтобы вернуть её в resetSeo.
const DEFAULT_OG_IMAGE =
  document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

// Текущий адрес открытой страницы — для og:url (превью при шеринге ссылки).
const currentUrl = () => (typeof window !== 'undefined' ? window.location.href : '')

// Краткое описание для мета-тега: режем до ~160 символов по границе слова.
function clip(text, max = 160) {
  const s = (text || '').trim()
  if (s.length <= max) return s
  return s.slice(0, s.lastIndexOf(' ', max) || max).trim() + '…'
}

function removeLd() {
  const old = document.getElementById(LD_ID)
  if (old) old.remove()
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
  setMeta('meta[property="og:url"]', 'content', currentUrl())

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

  removeLd()
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = LD_ID
  script.textContent = JSON.stringify(ld)
  document.head.appendChild(script)
}

// Возвращает мета-теги к значениям каталога/главной.
export function resetSeo() {
  document.title = DEFAULT_TITLE
  setMeta('meta[name="description"]', 'content', DEFAULT_DESC)
  setMeta('meta[property="og:title"]', 'content', DEFAULT_TITLE)
  setMeta('meta[property="og:description"]', 'content', DEFAULT_DESC)
  setMeta('meta[name="twitter:title"]', 'content', DEFAULT_TITLE)
  setMeta('meta[name="twitter:description"]', 'content', DEFAULT_DESC)
  if (DEFAULT_OG_IMAGE) {
    setMeta('meta[property="og:image"]', 'content', DEFAULT_OG_IMAGE)
    setMeta('meta[name="twitter:image"]', 'content', DEFAULT_OG_IMAGE)
  }
  setMeta('meta[property="og:url"]', 'content', currentUrl())
  removeLd()
}
