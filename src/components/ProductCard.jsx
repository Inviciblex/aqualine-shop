import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { formatPrice, getCategoryIconPaths, discountPercent } from '../utils.js'
import Highlight from './Highlight.jsx'

function FavoriteButton({ productId }) {
  const { isFavorite, toggle } = useFavorites()
  const active = isFavorite(productId)
  return (
    <button
      className={`card__fav ${active ? 'card__fav--active' : ''}`}
      onClick={() => toggle(productId)}
      aria-pressed={active}
      aria-label={active ? 'Убрать из избранного' : 'В избранное'}
      title={active ? 'Убрать из избранного' : 'В избранное'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 20s-7-4.5-9.5-9C1 8 2.5 5 5.5 5 7.5 5 9 6.2 12 9c3-2.8 4.5-4 6.5-4 3 0 4.5 3 3 6-2.5 4.5-9.5 9-9.5 9z"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

function Thumb({ product }) {
  const first = product.images && product.images[0]
  if (first) {
    return (
      <div className="card__thumb">
        <img src={first} alt={product.name} loading="lazy" />
      </div>
    )
  }
  return (
    <div className="card__thumb card__thumb--placeholder" aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: getCategoryIconPaths(product.category) }}
      />
    </div>
  )
}

export default function ProductCard({ product, highlight }) {
  const { addItem } = useCart()
  const href = `#/product/${product.id}`
  const off = discountPercent(product)

  return (
    <article className="card">
      <FavoriteButton productId={product.id} />
      <a className="card__link" href={href} aria-label={`Открыть «${product.name}»`}>
        {(off > 0 || product.clearance) && (
          <span className="card__badges">
            {off > 0 && <span className="discount-badge">−{off}%</span>}
            {product.clearance && <span className="clearance-badge">Уценка</span>}
          </span>
        )}
        <Thumb product={product} />
      </a>
      <div className="card__body">
        <div className="card__meta">
          <span className="card__sku">{product.sku}</span>
          {!product.inStock && <span className="badge badge--order">Под заказ</span>}
        </div>
        <a className="card__name-link" href={href}>
          <h3 className="card__name">
            <Highlight text={product.name} term={highlight} />
          </h3>
        </a>
        <p className="card__desc">
          <Highlight text={product.description} term={highlight} />
        </p>
        <div className="card__footer">
          <span className="card__prices">
            <span className="card__price">{formatPrice(product.price)}</span>
            {off > 0 && <span className="card__old">{formatPrice(product.oldPrice)}</span>}
          </span>
          <button className="btn btn--primary" onClick={() => addItem(product)}>
            В корзину
          </button>
        </div>
      </div>
    </article>
  )
}
