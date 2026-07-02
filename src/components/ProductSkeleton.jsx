// Скелетон карточки товара — повторяет раскладку ProductDetail (.detail): те же
// классы сетки/галереи/инфо, поэтому занимает почти то же место. Нужен при
// «холодном» заходе на /product/:id (каталог ещё грузится): раньше в этот момент
// показывался скелетон КАТАЛОГА (сетка), который затем сменялся вёрсткой товара —
// это давало сильный скачок макета (CLS ~1.28). Заглушка той же формы его убирает.
export default function ProductSkeleton() {
  return (
    <main className="detail" aria-hidden="true">
      <div className="crumbs">
        <div className="skeleton skeleton__line skeleton__line--sm" />
      </div>
      <div className="detail__grid">
        <div className="gallery">
          <div className="gallery__main">
            <div className="skeleton skel-fill" />
          </div>
          <div className="gallery__thumbs">
            <div className="skeleton skel-thumb" />
            <div className="skeleton skel-thumb" />
            <div className="skeleton skel-thumb" />
          </div>
        </div>
        <div className="detail__info">
          <div className="skeleton skeleton__line skeleton__line--sm" />
          <div className="skeleton skel-title" />
          <div className="skeleton skel-title skel-title--short" />
          <div className="skeleton skeleton__line skeleton__line--sm" />
          <div className="skeleton skeleton__line" />
          <div className="skeleton skeleton__line" />
          <div className="skeleton skeleton__line skeleton__line--price" />
          <div className="skeleton skel-button" />
        </div>
      </div>
      <span className="sr-only">Загрузка товара…</span>
    </main>
  )
}
