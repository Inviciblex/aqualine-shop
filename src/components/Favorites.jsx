import { useFavorites } from '../context/FavoritesContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../utils.js'
import ProductCard from './ProductCard.jsx'

export default function Favorites({ products = [], onBack }) {
  const { ids, removeMany } = useFavorites()
  const { addItem, openCart } = useCart()
  // Сохраняем порядок добавления (как в ids), показываем только существующие товары.
  const byId = new Map(products.map((p) => [p.id, p]))
  const list = ids.map((id) => byId.get(id)).filter(Boolean)
  const sum = list.reduce((s, p) => s + p.price, 0)

  // Добавить всю подборку в корзину (по одной штуке каждого), затем открыть корзину.
  function addAll() {
    for (const p of list) addItem(p, 1)
    if (list.length) openCart()
  }

  function clearAll() {
    if (list.length && window.confirm('Очистить избранное?')) removeMany(ids)
  }

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
        <>
          <div className="favorites__bar">
            <span className="favorites__summary">
              {list.length} шт. на сумму <b>{formatPrice(sum)}</b>
            </span>
            <div className="favorites__actions">
              <button className="btn btn--primary" onClick={addAll}>
                Добавить всё в корзину
              </button>
              <button className="favorites__clear" onClick={clearAll}>
                Очистить
              </button>
            </div>
          </div>
          <div className="grid">
            {list.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
