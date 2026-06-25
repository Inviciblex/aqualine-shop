import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from './catalog.js'
import { useCart } from './context/CartContext.jsx'
import Header from './components/Header.jsx'
import Filters from './components/Filters.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import RecentlyViewed from './components/RecentlyViewed.jsx'
import CatalogSkeleton from './components/CatalogSkeleton.jsx'
import ScrollTopButton from './components/ScrollTopButton.jsx'
import CookieBanner from './components/CookieBanner.jsx'
import { STORE_ADDRESS, MAPS_URL, STORE_HOURS } from './store.js'
import { setProductSeo, resetSeo } from './seo.js'
import { matchesQuery, searchableText } from './search.js'
import { parseFilters, buildCatalogHash } from './catalog-url.js'
import CartDrawer from './components/CartDrawer.jsx'
import Toast from './components/Toast.jsx'

// Маршруты и модалки грузим лениво — меньше стартовый бандл.
const ProductDetail = lazy(() => import('./components/ProductDetail.jsx'))
const MyOrders = lazy(() => import('./components/MyOrders.jsx'))
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy.jsx'))
const Contacts = lazy(() => import('./components/Contacts.jsx'))
const Warranty = lazy(() => import('./components/Warranty.jsx'))
const Returns = lazy(() => import('./components/Returns.jsx'))
const Guides = lazy(() => import('./components/Guides.jsx'))
const Favorites = lazy(() => import('./components/Favorites.jsx'))
const Checkout = lazy(() => import('./components/Checkout.jsx'))

// Маршрут из хеша: #/product/3 → товар, #/orders → заказы,
// #/privacy → политика конфиденциальности, иначе каталог.
function parseRoute() {
  const h = window.location.hash
  const m = h.match(/^#\/product\/(\d+)/)
  if (m) return { name: 'product', id: Number(m[1]) }
  if (/^#\/orders/.test(h)) return { name: 'orders' }
  if (/^#\/privacy/.test(h)) return { name: 'privacy' }
  if (/^#\/contacts/.test(h)) return { name: 'contacts' }
  if (/^#\/warranty/.test(h)) return { name: 'warranty' }
  if (/^#\/returns/.test(h)) return { name: 'returns' }
  if (/^#\/guides/.test(h)) return { name: 'guides' }
  if (/^#\/favorites/.test(h)) return { name: 'favorites' }
  return { name: 'catalog' }
}

// Позиция прокрутки каталога хранится в sessionStorage (фильтры теперь — в адресе).
const SS = window.sessionStorage
const readSS = (key, fallback) => {
  try {
    const v = SS.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

// Сколько карточек показывать изначально и докидывать по «Показать ещё».
const PAGE_SIZE = 9

// Анимацию появления карточек проигрываем один раз за загрузку страницы:
// при первом показе каталога. Возвраты из товара и смена фильтров её не
// переигрывают. Сбрасывается при полной перезагрузке (модуль вычисляется заново).
let catalogEntered = false

export default function App() {
  const { categories, products, status } = useCatalog()

  // Начальные фильтры берём из адреса (#/?q=...&cat=...): так ссылка на
  // отфильтрованную выдачу работает при открытии, перезагрузке и из закладок.
  const [initialFilters] = useState(() => parseFilters(window.location.hash))

  const [query, setQuery] = useState(initialFilters.query)
  const [activeCategories, setActiveCategories] = useState(initialFilters.categories)
  const [activeBrands, setActiveBrands] = useState(initialFilters.brands)
  const [priceMin, setPriceMin] = useState(initialFilters.priceMin)
  const [priceLimit, setPriceLimit] = useState(initialFilters.priceLimit)
  const [sort, setSort] = useState(initialFilters.sort)
  const [inStockOnly, setInStockOnly] = useState(initialFilters.inStockOnly)
  // Сколько товаров показывать (пагинация «Показать ещё»).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Поиск с задержкой: query — то, что в поле; deferredQuery — то, по чему фильтруем.
  const [deferredQuery, setDeferredQuery] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setDeferredQuery(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const { cartOpen, openCart, closeCart } = useCart()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [route, setRoute] = useState(parseRoute)

  const prevRouteName = useRef(route.name)
  const catalogScroll = useRef(readSS('f_scroll', 0))

  const maxPrice = useMemo(
    () => (products.length ? Math.max(...products.map((p) => p.price)) : 0),
    [products],
  )
  const minPrice = useMemo(
    () => (products.length ? Math.min(...products.map((p) => p.price)) : 0),
    [products],
  )
  // Список брендов для фильтра — уникальные непустые значения, по алфавиту.
  const brands = useMemo(
    () =>
      [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [products],
  )

  useEffect(() => {
    if (status === 'ready' && priceLimit === null) setPriceLimit(maxPrice)
  }, [status, maxPrice, priceLimit])
  // Нижнюю границу по умолчанию ставим в самую дешёвую цену каталога.
  useEffect(() => {
    if (status === 'ready' && priceMin === null) setPriceMin(minPrice)
  }, [status, minPrice, priceMin])

  // Пишем фильтры в адрес (только на каталоге — на странице товара адрес должен
  // оставаться #/product/N). replaceState не вызывает hashchange, поэтому петли
  // с роутером нет, а история не засоряется на каждый ввод. Берём deferredQuery,
  // чтобы адрес обновлялся после паузы в наборе, а не на каждую букву.
  useEffect(() => {
    if (route.name !== 'catalog') return
    const hash = buildCatalogHash(
      {
        query: deferredQuery,
        categories: activeCategories,
        brands: activeBrands,
        priceMin,
        priceLimit,
        inStockOnly,
        sort,
      },
      { minPrice, maxPrice },
    )
    const url = window.location.pathname + window.location.search + hash
    window.history.replaceState(window.history.state, '', url)
  }, [
    route.name,
    deferredQuery,
    activeCategories,
    activeBrands,
    priceMin,
    priceLimit,
    inStockOnly,
    sort,
    minPrice,
    maxPrice,
  ])

  // Навигация: при уходе из каталога запоминаем позицию прокрутки.
  useEffect(() => {
    const onHash = () => {
      if (prevRouteName.current === 'catalog') {
        catalogScroll.current = window.scrollY
        try {
          SS.setItem('f_scroll', JSON.stringify(window.scrollY))
        } catch {}
      }
      const next = parseRoute()
      prevRouteName.current = next.name
      setRoute(next)
      // Мгновенно, а не smooth: при smooth анимация прокрутки к верху не успевает
      // доехать — её прерывает подмена контента на карточку, и на мобиле страница
      // остаётся прокрученной туда же, где был список (см. scroll-behavior в CSS).
      if (next.name !== 'catalog') window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Возврат в каталог — восстанавливаем прокрутку (после отрисовки).
  useEffect(() => {
    if (route.name === 'catalog' && status === 'ready') {
      const y = catalogScroll.current
      // Тоже мгновенно — восстановление позиции не должно анимироваться.
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
    }
  }, [route, status])

  const toggleCategory = (c) =>
    setActiveCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  const clearCategories = () => setActiveCategories([])

  const toggleBrand = (b) =>
    setActiveBrands((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
  const clearBrands = () => setActiveBrands([])

  // «Назад в каталог» ведёт именно в каталог (ссылки имеют href="#/").
  // Раньше здесь был window.history.back(), из-за чего кнопка открывала
  // предыдущую страницу (например, другой товар), а не каталог.
  // Прокрутка каталога восстанавливается эффектом на смене маршрута.
  function handleBack() {}

  const openProduct = route.name === 'product' ? products.find((p) => p.id === route.id) : null

  // SEO: на странице товара — динамические title/description/OG + JSON-LD;
  // на остальных маршрутах возвращаем значения каталога. (При hash-роутинге
  // это влияет на превью ссылки и открытую страницу, см. комментарий в seo.js.)
  useEffect(() => {
    if (openProduct) setProductSeo(openProduct)
    else resetSeo()
    return () => resetSeo()
  }, [openProduct])

  // После первого показа каталога гасим флаг — следующие показы без анимации.
  const animateCards = !catalogEntered
  useEffect(() => {
    if (status === 'ready' && route.name === 'catalog') catalogEntered = true
  }, [status, route.name])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim()
    let list = products.filter((p) => {
      // Поиск устойчив к раскладке, транслиту и опечаткам (см. src/search.js).
      const matches = !q || matchesQuery(searchableText(p), q)
      const matchesCategory = activeCategories.length === 0 || activeCategories.includes(p.category)
      const matchesBrand = activeBrands.length === 0 || activeBrands.includes(p.brand)
      const matchesPrice = p.price >= priceMin && (priceLimit === null || p.price <= priceLimit)
      const matchesStock = !inStockOnly || p.inStock
      return matches && matchesCategory && matchesBrand && matchesPrice && matchesStock
    })

    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    return list
  }, [
    products,
    deferredQuery,
    activeCategories,
    activeBrands,
    priceMin,
    priceLimit,
    sort,
    inStockOnly,
  ])

  // При изменении фильтров/поиска показываем снова первую порцию.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredQuery, activeCategories, activeBrands, priceMin, priceLimit, sort, inStockOnly])

  const visibleProducts = filtered.slice(0, visibleCount)

  function resetFilters() {
    setQuery('')
    setActiveCategories([])
    setActiveBrands([])
    setInStockOnly(false)
    setPriceMin(minPrice)
    setPriceLimit(maxPrice)
    setSort('default')
  }

  // CTA в hero: плавно проматываем к каталогу (учитываем prefers-reduced-motion).
  function scrollToCatalog() {
    const el = document.getElementById('catalog')
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className={`app ${route.name === 'product' ? 'app--product' : ''}`}>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <Header onOpenCart={openCart} />

      <div id="main" tabIndex={-1}>
        <Suspense fallback={<div className="state">Загрузка…</div>}>
          {route.name === 'favorites' ? (
            <Favorites products={products} onBack={handleBack} />
          ) : route.name === 'contacts' ? (
            <Contacts onBack={handleBack} />
          ) : route.name === 'warranty' ? (
            <Warranty onBack={handleBack} />
          ) : route.name === 'returns' ? (
            <Returns onBack={handleBack} />
          ) : route.name === 'guides' ? (
            <Guides onBack={handleBack} />
          ) : route.name === 'privacy' ? (
            <PrivacyPolicy onBack={handleBack} />
          ) : route.name === 'orders' ? (
            <MyOrders onBack={handleBack} />
          ) : status === 'loading' ? (
            <CatalogSkeleton />
          ) : status === 'error' ? (
            <div className="state state--error">
              <p className="empty__title">Не удалось загрузить каталог</p>
              <p className="empty__hint">
                Проверьте источник товаров: файл <code>products.json</code> рядом с сайтом или адрес
                Google Таблицы в настройках.
              </p>
            </div>
          ) : openProduct ? (
            <ProductDetail
              key={openProduct.id}
              product={openProduct}
              products={products}
              onBack={handleBack}
              onCategory={(cat) => {
                setActiveCategories([cat])
                window.location.hash = '#/'
              }}
              onBrand={(b) => {
                setActiveBrands([b])
                window.location.hash = '#/'
              }}
            />
          ) : (
            <>
              <section className="hero">
                <div className="hero__inner">
                  <p className="hero__eyebrow">Сантехника · самовывоз</p>
                  <h1 className="hero__title">
                    Всё для воды в доме —<br />
                    от смесителя до инсталляции.
                  </h1>
                  <p className="hero__lead">
                    Проверенные смесители, раковины, унитазы и душевые системы. Понятные цены,
                    наличие на складе, удобный самовывоз из магазина.
                  </p>
                  <div className="hero__actions">
                    <button className="btn btn--primary btn--lg" onClick={scrollToCatalog}>
                      Смотреть каталог
                    </button>
                  </div>
                  <ul className="hero__benefits">
                    {['В наличии на складе', 'Самовывоз из магазина', 'Понятные цены'].map((b) => (
                      <li key={b} className="hero__benefit">
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                          <path
                            d="M5 12.5 L10 17.5 L19 7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <main className="catalog" id="catalog">
                <Filters
                  categories={categories}
                  query={query}
                  setQuery={setQuery}
                  activeCategories={activeCategories}
                  toggleCategory={toggleCategory}
                  clearCategories={clearCategories}
                  brands={brands}
                  activeBrands={activeBrands}
                  toggleBrand={toggleBrand}
                  clearBrands={clearBrands}
                  maxPrice={maxPrice}
                  minPrice={minPrice}
                  priceMin={priceMin ?? minPrice}
                  setPriceMin={setPriceMin}
                  priceLimit={priceLimit ?? maxPrice}
                  setPriceLimit={setPriceLimit}
                  sort={sort}
                  setSort={setSort}
                  inStockOnly={inStockOnly}
                  setInStockOnly={setInStockOnly}
                  resultCount={filtered.length}
                />
                <div className="catalog__main">
                  <ProductGrid
                    products={visibleProducts}
                    total={filtered.length}
                    onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    highlight={deferredQuery.trim()}
                    onReset={resetFilters}
                    animate={animateCards}
                  />
                  <RecentlyViewed products={products} />
                </div>
              </main>
            </>
          )}
        </Suspense>
      </div>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <span className="footer__logo">
              Аквалин<span className="logo__dot">.</span>
            </span>
            <p className="footer__tagline">
              Смесители, раковины, унитазы и душевые системы. Оплата при получении, самовывоз из
              магазина.
            </p>
          </div>

          <nav className="footer__col" aria-label="Покупателю">
            <h2 className="footer__head">Покупателю</h2>
            <a className="footer__link" href="#/guides">
              Как выбрать
            </a>
            <a className="footer__link" href="#/warranty">
              Гарантия
            </a>
            <a className="footer__link" href="#/returns">
              Возврат и обмен
            </a>
          </nav>

          <nav className="footer__col" aria-label="Магазин">
            <h2 className="footer__head">Магазин</h2>
            <a className="footer__link" href="#/contacts">
              Контакты
            </a>
            <a className="footer__link" href="#/privacy">
              Политика конфиденциальности
            </a>
          </nav>

          <div className="footer__col">
            <h2 className="footer__head">Адрес</h2>
            <a className="footer__link" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              {STORE_ADDRESS}
            </a>
            <span className="footer__muted">{STORE_HOURS}</span>
          </div>
        </div>

        <div className="footer__bar">
          <span>© Аквалин</span>
          <span className="footer__muted">Оплата при получении · только самовывоз</span>
        </div>
      </footer>

      <CartDrawer
        open={cartOpen}
        onClose={closeCart}
        onCheckout={() => {
          closeCart()
          setCheckoutOpen(true)
        }}
      />
      <Suspense fallback={null}>
        <Checkout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      </Suspense>
      <Toast />
      {/* На странице товара снизу — липкая панель покупки, кнопку «наверх» не показываем. */}
      {route.name !== 'product' && <ScrollTopButton />}
      <CookieBanner />
    </div>
  )
}
