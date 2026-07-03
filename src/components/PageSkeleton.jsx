// Скелетон контентной (легальной) страницы: повторяет раскладку .legal и
// РЕЗЕРВИРУЕТ высоту (min-height ~ экран), чтобы при «холодной» загрузке ленивого
// чанка футер не прыгал снизу вверх, когда крошечная заглушка «Загрузка…»
// сменяется высокой страницей (CLS). Используется как Suspense-фолбэк для
// инфо-маршрутов (гайды/гарантия/возврат/политика/контакты) — они длиннее экрана,
// поэтому зарезервированной высоты хватает, чтобы футер оставался ниже сгиба.
export default function PageSkeleton() {
  return (
    <main className="legal legal-skeleton" aria-hidden="true">
      <div className="skeleton skeleton__line skeleton__line--sm" />
      <div className="skeleton skel-title" />
      <div className="skeleton skeleton__line legal-skeleton__lead" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="legal-skeleton__section" key={i}>
          <div className="skeleton skel-title skel-title--short" />
          <div className="skeleton skeleton__line" />
          <div className="skeleton skeleton__line" />
          <div className="skeleton skeleton__line skeleton__line--sm" />
        </div>
      ))}
      <span className="sr-only">Загрузка…</span>
    </main>
  )
}
