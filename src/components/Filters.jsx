export default function Filters({
  categories,
  query,
  setQuery,
  activeCategories,
  toggleCategory,
  clearCategories,
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
  return (
    <aside className="filters" aria-label="Фильтры каталога">
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
              setPriceMin(e.target.value === '' ? minPrice : Math.max(0, Number(e.target.value) || 0))
            }
          />
          <span className="price-range__dash" aria-hidden="true">—</span>
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
              setPriceLimit(e.target.value === '' ? maxPrice : Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>
        <div className="dual-range">
          <div className="dual-range__track" aria-hidden="true">
            <div
              className="dual-range__fill"
              style={{
                left: `${((priceMin - minPrice) / ((maxPrice - minPrice) || 1)) * 100}%`,
                right: `${100 - ((priceLimit - minPrice) / ((maxPrice - minPrice) || 1)) * 100}%`,
              }}
            />
          </div>
          <input
            type="range"
            className="dual-range__input dual-range__input--min"
            min={minPrice}
            max={maxPrice}
            step={100}
            value={priceMin}
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
        <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
        <span className="toggle__label">Только в наличии</span>
      </label>

      <p className="filters__count">Найдено: {resultCount}</p>
    </aside>
  )
}
