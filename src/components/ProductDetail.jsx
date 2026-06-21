import { useEffect, useRef, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice, getCategoryIconPaths, discountPercent } from '../utils.js'
import { addRecent } from '../recent.js'
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

export default function ProductDetail({ product, products = [], onBack, onCategory, onBrand }) {
  const { addItem } = useCart()

  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4)

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
        <a className="crumbs__link" href="#/" onClick={onBack}>
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
          <div className="gallery__main">
            {hasImages ? (
              <img
                key={active}
                src={gallery[active]}
                alt={`${product.name} — фото ${active + 1}`}
              />
            ) : (
              <Placeholder key={active} category={product.category} label={`Фото ${active + 1}`} />
            )}
          </div>
          {gallery.length > 1 && (
            <div className="gallery__thumbs">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  className={`gallery__thumb ${i === active ? 'gallery__thumb--active' : ''}`}
                  onClick={() => setActive(i)}
                  aria-label={`Показать фото ${i + 1}`}
                >
                  {src ? <img src={src} alt="" /> : <Placeholder category={product.category} />}
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

          <button className="share-btn" onClick={handleShare}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="18" cy="5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="18" cy="19" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M8.2 10.8 L15.8 6.2 M8.2 13.2 L15.8 17.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            {copied ? 'Ссылка скопирована' : 'Поделиться'}
          </button>

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
    </main>
  )
}
