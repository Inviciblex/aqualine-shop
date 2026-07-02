import { useState } from 'react'

export default function Filters({
  categories,
  query,
  setQuery,
  activeCategories,
  toggleCategory,
  clearCategories,
  brands = [],
  activeBrands = [],
  toggleBrand,
  clearBrands,
  maxPrice,
  minPrice = 0,
  priceMin,
  setPriceMin,
  priceLimit,
  setPriceLimit,
  sort,
  setSort,
  inStockOnly,
  setInStockOnly,
  resultCount,
}) {
  // На мобиле фильтры свёрнуты за этой кнопкой, чтобы товары не уезжали вниз.
  // На десктопе (CSS) кнопка скрыта, а тело фильтров всегда раскрыто.
  const [open, setOpen] = useState(false)

  // Позиции заливки полосы ползунка. Клампим в [0..100] — на случай, если
  // границы на миг оказались инвертированы (min > max), полоса не «схлопнется».
  const priceSpan = maxPrice - minPrice || 1
  const fillLeft = Math.max(0, Math.min(100, ((priceMin - minPrice) / priceSpan) * 100))
  const fillRight = Math.max(0, Math.min(100, 100 - ((priceLimit - minPrice) / priceSpan) * 100))
  // Какой бегунок держать сверху для перетаскивания. По умолчанию (CSS) сверху
  // «до» — так у левого края можно схватить его и тянуть вправо. Когда «от»
  // уходит в правую половину и накладывается на «до», поднимаем «от» наверх,
  // иначе его не ухватить у правого края. Это «расцепляет» бегунки на обоих концах.
  const minOnTop = priceMin > minPrice + priceSpan / 2

  return (
    <aside className="filters" aria-label="Фильтры каталога">
      <button
        className="filters__toggle"
        aria-expanded={open}
        aria-controls="filters-body"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Фильтры</span>
        <span className="filters__toggle-count">Найдено: {resultCount}</span>
        <svg
          className={`filters__toggle-chevron ${open ? 'filters__toggle-chevron--open' : ''}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
          width="18"
          height="18"
        >
          <path
            d="M6 9 L12 15 L18 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div id="filters-body" className={`filters__body ${open ? 'filters__body--open' : ''}`}>
        <div className="filters__field">
          <label className="filters__label" htmlFor="search">
            Поиск
          </label>
          <input
            id="search"
            type="search"
            className="input"
            placeholder="Название или описание…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="filters__field">
          <span className="filters__label">Категория</span>
          <div className="chips">
            <button
              className={`chip ${activeCategories.length === 0 ? 'chip--active' : ''}`}
              onClick={clearCategories}
            >
              Все
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className={`chip ${activeCategories.includes(c) ? 'chip--active' : ''}`}
                onClick={() => toggleCategory(c)}
                aria-pressed={activeCategories.includes(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {brands.length > 0 && (
          <div className="filters__field">
            <span className="filters__label">Бренд</span>
            <div className="chips">
              <button
                className={`chip ${activeBrands.length === 0 ? 'chip--active' : ''}`}
                onClick={clearBrands}
              >
                Все
              </button>
              {brands.map((b) => (
                <button
                  key={b}
                  className={`chip ${activeBrands.includes(b) ? 'chip--active' : ''}`}
                  onClick={() => toggleBrand(b)}
                  aria-pressed={activeBrands.includes(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="filters__field">
          <span className="filters__label">Цена, ₽</span>
          <div className="price-range">
            <input
              type="number"
              className="input price-range__input"
              min={minPrice}
              max={maxPrice}
              step={100}
              inputMode="numeric"
              placeholder={String(minPrice)}
              aria-label="Цена от"
              value={priceMin}
              onChange={(e) =>
                setPriceMin(
                  e.target.value === ''
                    ? minPrice
                    : // не выше «до» — иначе диапазон инвертируется и выдача пустеет
                      Math.min(Math.max(0, Number(e.target.value) || 0), priceLimit),
                )
              }
            />
            <span className="price-range__dash" aria-hidden="true">
              —
            </span>
            <input
              type="number"
              className="input price-range__input"
              min={minPrice}
              max={maxPrice}
              step={100}
              inputMode="numeric"
              placeholder={String(maxPrice)}
              aria-label="Цена до"
              value={priceLimit}
              onChange={(e) =>
                setPriceLimit(
                  e.target.value === ''
                    ? maxPrice
                    : // не ниже «от» и не выше максимума каталога
                      Math.max(Math.min(Number(e.target.value) || 0, maxPrice), priceMin),
                )
              }
            />
          </div>
          <div className="dual-range">
            <div className="dual-range__track" aria-hidden="true">
              <div
                className="dual-range__fill"
                style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
              />
            </div>
            <input
              type="range"
              className="dual-range__input dual-range__input--min"
              min={minPrice}
              max={maxPrice}
              step={100}
              value={priceMin}
              // Поднимаем «от» над «до», когда он в правой половине (см. minOnTop).
              style={minOnTop ? { zIndex: 5 } : undefined}
              aria-label="Цена от (ползунок)"
              onChange={(e) => setPriceMin(Math.min(Number(e.target.value), priceLimit))}
            />
            <input
              type="range"
              className="dual-range__input dual-range__input--max"
              min={minPrice}
              max={maxPrice}
              step={100}
              value={priceLimit}
              aria-label="Цена до (ползунок)"
              onChange={(e) => setPriceLimit(Math.max(Number(e.target.value), priceMin))}
            />
          </div>
        </div>

        <div className="filters__field">
          <label className="filters__label" htmlFor="sort">
            Сортировка
          </label>
          <select
            id="sort"
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="default">По умолчанию</option>
            <option value="price-asc">Сначала дешевле</option>
            <option value="price-desc">Сначала дороже</option>
            <option value="name">По названию</option>
          </select>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
          />
          <span className="toggle__track" aria-hidden="true">
            <span className="toggle__thumb" />
          </span>
          <span className="toggle__label">Только в наличии</span>
        </label>

        <p className="filters__count" aria-live="polite">
          Найдено: {resultCount}
        </p>
      </div>
    </aside>
  )
}
