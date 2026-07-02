// Сериализация фильтров каталога в query-строку адреса и обратно — чистая логика,
// вынесена ради тестируемости и переиспользования.
//
// Формат адреса каталога (History-роутинг):
//   /?q=кран&cat=Смесители,Раковины&brand=Аквалин&min=1000&max=5000&stock=1&sort=price-asc
// Параметры, равные значениям по умолчанию (пустой поиск, полный диапазон цен,
// сортировка default, без фильтра наличия), в адрес не попадают — ссылка чистая.

// Разбор строки запроса (window.location.search вида "?q=…") в объект фильтров.
// Толерантен ко входу: принимает и "?q=…", и "q=…" — ищет "?" в любом месте.
export function parseFilters(search) {
  const s = typeof search === 'string' ? search : ''
  const qIndex = s.indexOf('?')
  const params = new URLSearchParams(qIndex === -1 ? '' : s.slice(qIndex + 1))

  const list = (key) =>
    (params.get(key) || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

  const num = (key) => {
    const v = params.get(key)
    if (v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  return {
    query: params.get('q') || '',
    categories: list('cat'),
    brands: list('brand'),
    priceMin: num('min'),
    priceLimit: num('max'),
    inStockOnly: params.get('stock') === '1',
    sort: params.get('sort') || 'default',
  }
}

// Сборка адреса каталога из фильтров. bounds = { minPrice, maxPrice } — границы
// каталога: если выбранный диапазон совпадает с ними, цены в адрес не пишем.
// Возвращает "/" (чистый каталог) либо "/?<query>".
export function buildCatalogUrl(filters, bounds = {}) {
  const params = new URLSearchParams()
  const { minPrice, maxPrice } = bounds

  const q = (filters.query || '').trim()
  if (q) params.set('q', q)
  if (filters.categories && filters.categories.length)
    params.set('cat', filters.categories.join(','))
  if (filters.brands && filters.brands.length) params.set('brand', filters.brands.join(','))
  if (filters.inStockOnly) params.set('stock', '1')
  if (filters.sort && filters.sort !== 'default') params.set('sort', filters.sort)
  if (filters.priceMin != null && (minPrice == null || filters.priceMin > minPrice)) {
    params.set('min', String(filters.priceMin))
  }
  if (filters.priceLimit != null && (maxPrice == null || filters.priceLimit < maxPrice)) {
    params.set('max', String(filters.priceLimit))
  }

  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}
