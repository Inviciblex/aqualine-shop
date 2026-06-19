import { getRecent } from '../recent.js'
import ProductCard from './ProductCard.jsx'

// Показывает недавно просмотренные товары (если есть). Читает список id из
// localStorage и сопоставляет с актуальным каталогом.
export default function RecentlyViewed({ products, excludeId }) {
  const ids = getRecent()
  if (!ids.length) return null

  const byId = new Map(products.map((p) => [p.id, p]))
  const items = ids
    .filter((id) => id !== excludeId)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 6)

  if (items.length === 0) return null

  return (
    <section className="recent">
      <h2 className="recent__title">Недавно просмотренные</h2>
      <div className="recent__row">
        {items.map((p) => (
          <div className="recent__item" key={p.id}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
