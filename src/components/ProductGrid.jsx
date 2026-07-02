import { useEffect, useRef } from 'react'
import ProductCard from './ProductCard.jsx'

export default function ProductGrid({
  products,
  highlight,
  onReset,
  total,
  onShowMore,
  animate = false,
  categories = [],
  onPickCategory,
}) {
  const gridRef = useRef(null)
  // Индекс первой «новой» карточки после «Показать ещё» — туда вернём фокус,
  // чтобы клавиатура/скринридер не перескакивали в начало списка.
  const focusFromRef = useRef(null)

  useEffect(() => {
    if (focusFromRef.current == null) return
    const cards = gridRef.current?.querySelectorAll('.card')
    const target = cards?.[focusFromRef.current]
    target?.querySelector('a.card__link, a, button')?.focus()
    focusFromRef.current = null
  }, [products.length])

  function handleShowMore() {
    focusFromRef.current = products.length // первая новая карточка после прироста
    onShowMore()
  }

  if (products.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Ничего не нашлось</p>
        <p className="empty__hint">
          {highlight ? `По запросу «${highlight}» ничего нет. ` : ''}
          Попробуйте изменить запрос или посмотреть категорию.
        </p>
        {categories.length > 0 && onPickCategory && (
          <div className="empty__cats">
            {categories.slice(0, 6).map((c) => (
              <button key={c} className="chip" onClick={() => onPickCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {onReset && (
          <button className="btn btn--primary empty__reset" onClick={onReset}>
            Сбросить фильтры
          </button>
        )}
      </div>
    )
  }

  const shown = products.length
  const hasMore = typeof total === 'number' && shown < total

  return (
    <>
      <div className={`grid ${animate ? 'grid--enter' : ''}`} ref={gridRef}>
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} highlight={highlight} priority={i < 4} />
        ))}
      </div>
      {hasMore && (
        <div className="show-more">
          <button className="btn show-more__btn" onClick={handleShowMore}>
            Показать ещё
          </button>
          <span className="show-more__count">
            Показано {shown} из {total}
          </span>
        </div>
      )}
    </>
  )
}
