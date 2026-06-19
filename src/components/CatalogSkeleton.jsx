// Скелетон каталога — пульсирующие заглушки-карточки на время загрузки.
export default function CatalogSkeleton({ count = 9 }) {
  return (
    <div className="skeleton-catalog" aria-hidden="true">
      <div className="grid">
        {Array.from({ length: count }).map((_, i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton skeleton__thumb" />
            <div className="skeleton-card__body">
              <div className="skeleton skeleton__line skeleton__line--sm" />
              <div className="skeleton skeleton__line" />
              <div className="skeleton skeleton__line skeleton__line--price" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Загрузка каталога…</span>
    </div>
  )
}
