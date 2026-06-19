import { useFavorites } from '../context/FavoritesContext.jsx'
import ProductCard from './ProductCard.jsx'

export default function Favorites({ products = [], onBack }) {
  const { ids } = useFavorites()
  // Сохраняем порядок добавления (как в ids), показываем только существующие товары.
  const byId = new Map(products.map((p) => [p.id, p]))
  const list = ids.map((id) => byId.get(id)).filter(Boolean)

  return (
    <main className="favorites">
      <a className="back" href="#/" onClick={onBack}>
        <span aria-hidden="true">←</span> Назад в каталог
      </a>
      <h1 className="favorites__title">Избранное</h1>

      {list.length === 0 ? (
        <div className="state">
          <p className="empty__title">В избранном пусто</p>
          <p className="empty__hint">
            Нажимайте «сердечко» на карточке товара — отложенные товары появятся здесь.
          </p>
        </div>
      ) : (
        <div className="grid">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  )
}
