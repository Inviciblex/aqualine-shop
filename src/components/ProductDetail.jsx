import { useEffect, useRef, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { formatPrice, getCategoryIconPaths, discountPercent } from '../utils.js'
import { PAYMENT_METHODS, STORE_TELEGRAM_URL } from '../store.js'
import { addRecent } from '../recent.js'
import { relatedProducts } from '../related.js'
import { onProxyImgError } from '../image-url.js'
import { useModalA11y } from '../useModalA11y.js'
import ProductCard from './ProductCard.jsx'
// Заглушка-изображение (когда у товара нет фото). category — для иконки.
function Placeholder({ category, label }) {
  return (
    <div className="ph" aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: getCategoryIconPaths(category) }}
      />
      {label && <span className="ph__label">{label}</span>}
    </div>
  )
}

// Иконка-подсказка «увеличить» в углу фото (лежит на каждом слайде галереи).
function ZoomHint() {
  return (
    <span className="gallery__zoom-hint" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M20 20 L16 16 M11 8 V14 M8 11 H14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export default function ProductDetail({ product, products = [], onBack, onCategory, onBrand }) {
  const { addItem } = useCart()
  const { isFavorite, toggle } = useFavorites()
  const fav = isFavorite(product.id)

  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4)

  // Кросс-категорийные дополнения («С этим покупают»), в отличие от «Похожих».
  const withYou = relatedProducts(product, products, 4)

  const off = discountPercent(product)

  // запоминаем просмотр товара
  useEffect(() => {
    addRecent(product.id)
  }, [product.id])

  // Если фото есть — используем их; если нет — показываем 3 заглушки,
  // чтобы была видна сама галерея (замените на реальные ссылки в products.js).
  const hasImages = product.images && product.images.length > 0
  const gallery = hasImages ? product.images : [null, null, null]
  const [active, setActive] = useState(0)
  const [qty, setQty] = useState(1)
  const [copied, setCopied] = useState(false)

  // Копирование с фолбэком: Clipboard API требует HTTPS (secure context),
  // поэтому по http (напр. локальный IP) используем легаси-execCommand.
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // упало — пробуем легаси-способ ниже
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  // Поделиться товаром: на HTTPS-телефоне — системное меню (Web Share API),
  // иначе — копирование ссылки в буфер с подтверждением.
  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: product.name, url })
      } catch {
        // пользователь закрыл системное меню — ничего не делаем
      }
      return
    }
    if (await copyText(url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Лайтбокс: увеличенное фото по клику. Листаем то же активное фото галереи.
  const [zoom, setZoom] = useState(false)
  const zoomRef = useRef(null)
  useModalA11y(zoomRef, { active: zoom, onClose: () => setZoom(false) })
  const step = (dir) => setActive((a) => (a + dir + gallery.length) % gallery.length)
  const onZoomKey = (e) => {
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  }

  // Свайп-карусель главного фото. Активный слайд = ближайший к центру трека;
  // определяем по позиции скролла (rAF-троттлинг, чтобы не дёргать состояние).
  const trackRef = useRef(null)
  const scrollRafRef = useRef(0)
  const activeRef = useRef(0)
  activeRef.current = active
  const onTrackScroll = () => {
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      const el = trackRef.current
      if (!el || !el.clientWidth) return
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      setActive((a) => (idx !== a && idx >= 0 && idx < gallery.length ? idx : a))
    })
  }
  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), [])

  // Переход к фото i: в карусели — прокрутка (плавность берётся из CSS,
  // на десктопе это листает трек кликом по миниатюре), иначе — смена активного
  // (случай заглушек, когда карусели нет).
  const goTo = (i) => {
    const el = trackRef.current
    if (el && el.clientWidth) el.scrollLeft = i * el.clientWidth
    else setActive(i)
  }
  const openZoom = (i) => {
    setActive(i)
    setZoom(true)
  }

  // Закрыли лайтбокс — подводим карусель к фото, на котором вышли (в лайтбоксе
  // могли листать стрелками/свайпом, а трек оставался на старом кадре).
  useEffect(() => {
    if (zoom) return
    const el = trackRef.current
    if (el && el.clientWidth) el.scrollLeft = activeRef.current * el.clientWidth
  }, [zoom])

  // Свайп в лайтбоксе: горизонтальный жест листает фото; чтобы такой жест не
  // закрыл лайтбокс как «клик по фону», гасим следующий клик флагом.
  const lbTouchX = useRef(null)
  const lbSwipedRef = useRef(false)
  const onLbTouchStart = (e) => {
    // Каждый новый жест начинается «чистым»: на мобильных после смахивания клик
    // может не прийти, поэтому не полагаемся на него для сброса флага.
    lbSwipedRef.current = false
    lbTouchX.current = e.touches[0]?.clientX ?? null
  }
  const onLbTouchEnd = (e) => {
    const x0 = lbTouchX.current
    lbTouchX.current = null
    if (x0 == null) return
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0
    if (Math.abs(dx) > 40 && gallery.length > 1) {
      lbSwipedRef.current = true
      step(dx < 0 ? 1 : -1)
    }
  }
  const onLbClick = () => {
    if (lbSwipedRef.current) {
      lbSwipedRef.current = false
      return
    }
    setZoom(false)
  }

  // Липкую панель показываем только когда основная кнопка ушла за экран.
  const addBtnRef = useRef(null)
  const [showBar, setShowBar] = useState(false)
  useEffect(() => {
    const el = addBtnRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), {
      rootMargin: '0px 0px -8px 0px',
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <main className="detail">
      <nav className="crumbs" aria-label="Хлебные крошки">
        <a className="crumbs__link" href="/" onClick={onBack}>
          Каталог
        </a>
        {product.category && (
          <>
            <span className="crumbs__sep" aria-hidden="true">
              /
            </span>
            <button
              className="crumbs__link crumbs__btn"
              onClick={() => onCategory?.(product.category)}
            >
              {product.category}
            </button>
          </>
        )}
        <span className="crumbs__sep" aria-hidden="true">
          /
        </span>
        <span className="crumbs__current" aria-current="page">
          {product.name}
        </span>
      </nav>

      <div className="detail__grid">
        {/* Галерея */}
        <div className="gallery">
          {hasImages ? (
            <div
              className="gallery__main gallery__main--carousel"
              ref={trackRef}
              onScroll={onTrackScroll}
            >
              {gallery.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className="gallery__zoom gallery__slide"
                  onClick={() => openZoom(i)}
                  aria-label={`Увеличить фото ${i + 1}`}
                >
                  <img
                    src={src}
                    alt={`${product.name} — фото ${i + 1}`}
                    width="800"
                    height="800"
                    decoding="async"
                    loading={i === 0 ? undefined : 'lazy'}
                    onError={onProxyImgError}
                  />
                  <ZoomHint />
                </button>
              ))}
            </div>
          ) : (
            <div className="gallery__main">
              <Placeholder key={active} category={product.category} label={`Фото ${active + 1}`} />
            </div>
          )}
          {gallery.length > 1 && (
            <div className="gallery__thumbs">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  className={`gallery__thumb ${i === active ? 'gallery__thumb--active' : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={`Показать фото ${i + 1}`}
                >
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      width="96"
                      height="96"
                      loading="lazy"
                      decoding="async"
                      onError={onProxyImgError}
                    />
                  ) : (
                    <Placeholder category={product.category} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Информация */}
        <div className="detail__info">
          <span className="detail__sku">{product.sku}</span>
          <h1 className="detail__name">{product.name}</h1>
          {product.brand && (
            <p className="detail__brand">
              Бренд:{' '}
              <button className="detail__brand-link" onClick={() => onBrand?.(product.brand)}>
                {product.brand}
              </button>
            </p>
          )}
          <p className="detail__desc">{product.description}</p>

          <div className="detail__buy">
            <span className="detail__price">{formatPrice(product.price)}</span>
            {off > 0 && (
              <>
                <span className="detail__old">{formatPrice(product.oldPrice)}</span>
                <span className="discount-badge discount-badge--inline">−{off}%</span>
              </>
            )}
            <span className={`badge ${product.inStock ? 'badge--stock' : 'badge--order'}`}>
              {product.inStock ? 'В наличии' : 'Под заказ'}
            </span>
            {product.clearance && <span className="badge badge--clearance">Уценка</span>}
          </div>

          <div className="detail__actions">
            <div className="qty qty--lg">
              <button
                className="qty__btn"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Уменьшить количество"
              >
                −
              </button>
              <span className="qty__value">{qty}</span>
              <button
                className="qty__btn"
                onClick={() => setQty((q) => q + 1)}
                aria-label="Увеличить количество"
              >
                +
              </button>
            </div>
            <button
              ref={addBtnRef}
              className="btn btn--primary btn--lg"
              onClick={() => addItem(product, qty)}
            >
              Добавить в корзину
            </button>
          </div>

          {!product.inStock && (
            <p className="detail__preorder">
              «Под заказ» — наличие и срок поставки уточним после брони.{' '}
              <a href={STORE_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                Спросить в Telegram
              </a>
            </p>
          )}

          <div className="detail__secondary">
            <button
              className={`fav-btn ${fav ? 'fav-btn--active' : ''}`}
              onClick={() => toggle(product.id)}
              aria-pressed={fav}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20s-7-4.5-9.5-9C1 8 2.5 5 5.5 5 7.5 5 9 6.2 12 9c3-2.8 4.5-4 6.5-4 3 0 4.5 3 3 6-2.5 4.5-9.5 9-9.5 9z"
                  fill={fav ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              {fav ? 'В избранном' : 'В избранное'}
            </button>
            <button className="share-btn" onClick={handleShare}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="18"
                  cy="5"
                  r="2.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle
                  cx="6"
                  cy="12"
                  r="2.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle
                  cx="18"
                  cy="19"
                  r="2.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M8.2 10.8 L15.8 6.2 M8.2 13.2 L15.8 17.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              {copied ? 'Ссылка скопирована' : 'Поделиться'}
            </button>
          </div>

          <ul className="detail__assurance">
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                <rect
                  x="3"
                  y="6"
                  width="18"
                  height="12"
                  rx="2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path d="M3 10 H21" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Оплата при получении: {PAYMENT_METHODS.toLowerCase()}
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                <path
                  d="M4 10 L12 4 L20 10 V19 a1 1 0 0 1-1 1 H5 a1 1 0 0 1-1-1 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              Самовывоз из магазина — доставки нет
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                <path
                  d="M12 3 L20 6 V11 c0 5-3.5 8-8 10 -4.5-2-8-5-8-10 V6 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              <a href="/warranty">Гарантия</a> и <a href="/returns">возврат в течение 14 дней</a>
            </li>
          </ul>

          {product.specs && product.specs.length > 0 && (
            <div className="specs">
              <h2 className="specs__title">Характеристики</h2>
              <table className="specs__table">
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={i}>
                      <th>{s.label}</th>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {withYou.length > 0 && (
        <section className="related">
          <h2 className="related__title">С этим покупают</h2>
          <div className="grid related__grid">
            {withYou.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="related">
          <h2 className="related__title">Похожие товары</h2>
          <div className="grid related__grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Липкая панель снизу — появляется, когда кнопка выше ушла за экран */}
      <div className={`buybar ${showBar ? 'buybar--show' : ''}`}>
        <span className="buybar__price">{formatPrice(product.price)}</span>
        <button className="btn btn--primary buybar__btn" onClick={() => addItem(product, qty)}>
          В корзину{qty > 1 ? ` · ${qty} шт.` : ''}
        </button>
      </div>

      {/* Лайтбокс: увеличенное фото. Закрытие — ✕/Esc/клик по фону/стрелки листают */}
      {zoom && hasImages && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} — просмотр фото`}
          ref={zoomRef}
          tabIndex={-1}
          onClick={onLbClick}
          onKeyDown={onZoomKey}
          onTouchStart={onLbTouchStart}
          onTouchEnd={onLbTouchEnd}
        >
          <button className="lightbox__close" aria-label="Закрыть" onClick={() => setZoom(false)}>
            ✕
          </button>
          <img
            className="lightbox__img"
            src={gallery[active]}
            alt={`${product.name} — фото ${active + 1}`}
            decoding="async"
            onClick={(e) => e.stopPropagation()}
            onError={onProxyImgError}
          />
          {gallery.length > 1 && (
            <>
              <button
                className="lightbox__nav lightbox__nav--prev"
                aria-label="Предыдущее фото"
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
              >
                ‹
              </button>
              <button
                className="lightbox__nav lightbox__nav--next"
                aria-label="Следующее фото"
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
              >
                ›
              </button>
              <div className="lightbox__count" aria-hidden="true">
                {active + 1} / {gallery.length}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
