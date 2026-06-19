import ProductCard from './ProductCard.jsx'

export default function ProductGrid({ products, highlight, onReset }) {
  if (products.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Ничего не нашлось</p>
        <p className="empty__hint">
          {highlight ? `По запросу «${highlight}» ничего нет. ` : ''}
          Попробуйте изменить запрос или сбросить фильтры.
        </p>
        {onReset && (
          <button className="btn btn--primary empty__reset" onClick={onReset}>
            Сбросить фильтры
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} highlight={highlight} />
      ))}
    </div>
  )
}
