export default function Filters({
  categories,
  query,
  setQuery,
  activeCategories,
  toggleCategory,
  clearCategories,
  maxPrice,
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
        <label className="filters__label" htmlFor="price">
          Цена до <span className="filters__price">{priceLimit.toLocaleString('ru-RU')} ₽</span>
        </label>
        <input
          id="price"
          type="range"
          className="range"
          min={0}
          max={maxPrice}
          step={100}
          value={priceLimit}
          onChange={(e) => setPriceLimit(Number(e.target.value))}
        />
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
