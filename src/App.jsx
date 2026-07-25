import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from './catalog.js'
import { useCart } from './context/CartContext.jsx'
import Header from './components/Header.jsx'
import Filters from './components/Filters.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import RecentlyViewed from './components/RecentlyViewed.jsx'
import CatalogSkeleton from './components/CatalogSkeleton.jsx'
import ProductSkeleton from './components/ProductSkeleton.jsx'
import PageSkeleton from './components/PageSkeleton.jsx'
import ScrollTopButton from './components/ScrollTopButton.jsx'
import CookieBanner from './components/CookieBanner.jsx'
import HeroArt from './components/HeroArt.jsx'
import AnnouncementBanner from './components/AnnouncementBanner.jsx'
import {
  STORE_ADDRESS,
  MAPS_URL,
  STORE_HOURS,
  STORE_PHONE,
  STORE_PHONE_HREF,
  STORE_EMAIL,
  STORE_EMAIL_HREF,
  STORE_TELEGRAM_URL,
} from './store.js'
import { setProductSeo, resetSeo } from './seo.js'
import { matchesQuery, searchableText } from './search.js'
import { parseFilters, buildCatalogUrl } from './catalog-url.js'
import { parseRoute, navigate, subscribe, syncSearch } from './router.js'
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

// Маршрут теперь из настоящего пути (History-роутинг): /product/3 → товар,
// /orders → заказы, / → каталог. Разбор — в src/router.js + src/routes.js.

// Заголовки вкладки по маршруту (товар выставляет свой в setProductSeo,
// каталог — дефолтный из resetSeo).
const ROUTE_TITLES = {
  favorites: 'Избранное — Аквалин',
  contacts: 'Контакты — Аквалин',
  orders: 'Мои брони — Аквалин',
  privacy: 'Политика конфиденциальности — Аквалин',
  warranty: 'Гарантия — Аквалин',
  returns: 'Возврат и обмен — Аквалин',
  guides: 'Как выбрать — Аквалин',
}

// Уникальные meta description по разделам — иначе все страницы делят описание
// главной (дубли вредят SEO). Каталог/главная — дефолт из resetSeo.
const ROUTE_DESCRIPTIONS = {
  favorites:
    'Избранные товары Аквалин: сохранённые смесители, раковины и душевые системы. Забронируйте с самовывозом из магазина.',
  contacts:
    'Контакты магазина сантехники Аквалин: адрес, телефон, часы работы и схема проезда. Самовывоз заказов из магазина.',
  orders:
    'Мои брони в Аквалин: статусы заказов и сроки хранения. Назовите номер брони при получении — оплата при самовывозе.',
  privacy:
    'Политика конфиденциальности Аквалин: как обрабатываются персональные данные покупателей (152-ФЗ).',
  warranty:
    'Гарантия на сантехнику в Аквалин: сроки, условия и порядок обращения при обнаружении недостатков товара.',
  returns:
    'Возврат и обмен сантехники в Аквалин: условия по закону о защите прав потребителей, сроки и порядок.',
  guides:
    'Как выбрать сантехнику: гайды по смесителям, раковинам, унитазам и душевым системам от магазина Аквалин.',
}

// Личные/тонкие страницы, которые не должны попадать в индекс: для краулера они
// пустые (данные — в localStorage) и дублируют друг друга. В sitemap их нет, но
// они есть в навигации шапки, поэтому ставим им noindex явно.
const NOINDEX_ROUTES = new Set(['favorites', 'orders'])

// Контентные (легальные) маршруты: длинные статичные страницы. Их ленивый чанк
// при «холодном» заходе показывает скелетон в форме .legal с зарезервированной
// высотой — иначе крошечное «Загрузка…» → высокая страница даёт скачок макета
// (CLS). Личные (favorites/orders) сюда не входят: они короткие/персональные.
const CONTENT_ROUTES = new Set(['guides', 'warranty', 'returns', 'privacy', 'contacts'])

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
  const { categories, products, status, reload } = useCatalog()

  // Начальные фильтры берём из адреса (/?q=...&cat=...): так ссылка на
  // отфильтрованную выдачу работает при открытии, перезагрузке и из закладок.
  const [initialFilters] = useState(() => parseFilters(window.location.search))

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
  const prevRouteId = useRef(route.id)
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
  // оставаться /product/N). syncSearch делает replaceState без оповещения роутера,
  // поэтому петли нет. Запись задержана (debounce): быстрый драг ползунка цены даёт
  // сотни изменений в секунду, и без задержки каждый тик дёргал бы history.replaceState —
  // Safari/WebKit после ~100 вызовов/30с бросает SecurityError и роняет страницу.
  // Задержка схлопывает всю серию правок в один вызов после паузы.
  useEffect(() => {
    if (route.name !== 'catalog') return
    const url = buildCatalogUrl(
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
    const t = setTimeout(() => syncSearch(url), 200)
    return () => clearTimeout(t)
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
    const onNav = () => {
      const next = parseRoute()
      // Тот же маршрут (например, закрытие оверлея через history.back с тем же
      // URL) — выходим: без прокрутки к верху и лишнего ре-рендера.
      if (next.name === prevRouteName.current && next.id === prevRouteId.current) return
      if (prevRouteName.current === 'catalog') {
        catalogScroll.current = window.scrollY
        try {
          SS.setItem('f_scroll', JSON.stringify(window.scrollY))
        } catch {}
      }
      prevRouteName.current = next.name
      prevRouteId.current = next.id
      setRoute(next)
      // Мгновенно, а не smooth: при smooth анимация прокрутки к верху не успевает
      // доехать — её прерывает подмена контента на карточку, и на мобиле страница
      // остаётся прокрученной туда же, где был список (см. scroll-behavior в CSS).
      if (next.name !== 'catalog') window.scrollTo({ top: 0, behavior: 'instant' })
    }
    // Подписка на роутер: переходы (pushState) и кнопки назад/вперёд (popstate).
    return subscribe(onNav)
  }, [])

  // Возврат в каталог — восстанавливаем прокрутку (после отрисовки).
  useEffect(() => {
    if (route.name === 'catalog' && status === 'ready') {
      const y = catalogScroll.current
      // Тоже мгновенно — восстановление позиции не должно анимироваться.
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
    }
  }, [route, status])

  // Кнопка «назад» закрывает открытый оверлей (корзину/оформление), а не уводит
  // со страницы. На открытии кладём запись в историю; по popstate (системная
  // «назад»/свайп) — закрываем оверлей. Закрытие через UI откручивает запись
  // назад (history.back), чтобы не копить «пустые» шаги. Один уровень на оба
  // оверлея: переход корзина→оформление overlayOpen не меняет, эффект не
  // перезапускается, лишних записей не появляется.
  const overlayOpen = cartOpen || checkoutOpen
  const closeOverlaysRef = useRef(null)
  closeOverlaysRef.current = () => {
    closeCart()
    setCheckoutOpen(false)
  }
  useEffect(() => {
    if (!overlayOpen) return
    try {
      window.history.pushState({ overlay: true }, '')
    } catch {
      // Safari ограничивает частоту pushState — в худшем случае просто не
      // перехватим «назад» в этот раз, без падения.
    }
    const onPop = () => closeOverlaysRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Закрыли через UI (не «назад») — убираем свою запись из истории.
      if (window.history.state?.overlay) window.history.back()
    }
  }, [overlayOpen])

  const toggleCategory = (c) =>
    setActiveCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  const clearCategories = () => setActiveCategories([])

  const toggleBrand = (b) =>
    setActiveBrands((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
  const clearBrands = () => setActiveBrands([])

  // «Назад в каталог» ведёт именно в каталог: ссылки имеют href="/", и по клику
  // их перехватывает роутер (см. src/router.js). Раньше здесь был history.back(),
  // из-за чего кнопка открывала предыдущую страницу (например, другой товар), а
  // не каталог. Прокрутка каталога восстанавливается эффектом на смене маршрута.
  function handleBack() {}

  const openProduct = route.name === 'product' ? products.find((p) => p.id === route.id) : null

  // SEO: на странице товара — динамические title/description/OG + JSON-LD;
  // на остальных маршрутах возвращаем значения каталога и ставим заголовок
  // раздела (иначе title статичен и не помогает вкладкам/скринридеру).
  useEffect(() => {
    if (openProduct) {
      setProductSeo(openProduct)
    } else {
      resetSeo({
        title: ROUTE_TITLES[route.name],
        description: ROUTE_DESCRIPTIONS[route.name],
        noindex: NOINDEX_ROUTES.has(route.name),
      })
    }
    return () => resetSeo()
  }, [openProduct, route.name])

  // Доступность: при смене маршрута переводим фокус в основную область (кроме
  // первой загрузки), чтобы клавиатура/скринридер начинали с нового контента.
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false
      return
    }
    document.getElementById('main')?.focus()
  }, [route.name])

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
      <AnnouncementBanner />
      <Header onOpenCart={openCart} />

      <div id="main" tabIndex={-1}>
        {/* Фолбэк ленивых чанков зависит от маршрута: для товара — скелетон той
            же формы, для длинных инфо-страниц — скелетон .legal с резервом высоты
            (иначе крошечное «Загрузка…» → высокая страница давало скачок макета,
            CLS). Для остального — простое «Загрузка…». */}
        <Suspense
          fallback={
            route.name === 'product' ? (
              <ProductSkeleton />
            ) : CONTENT_ROUTES.has(route.name) ? (
              <PageSkeleton />
            ) : (
              <div className="state">Загрузка…</div>
            )
          }
        >
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
            <MyOrders onBack={handleBack} products={products} />
          ) : route.name === 'product' && status === 'loading' ? (
            // «Холодный» заход на товар: показываем скелетон В ФОРМЕ товара, а не
            // каталога — иначе смена сетки на карточку даёт большой скачок (CLS).
            <ProductSkeleton />
          ) : status === 'loading' ? (
            <CatalogSkeleton />
          ) : status === 'error' ? (
            <div className="state state--error">
              <p className="empty__title">Не удалось загрузить каталог</p>
              <p className="empty__hint">Проверьте интернет-соединение и попробуйте ещё раз.</p>
              <button className="btn btn--primary" onClick={reload}>
                Повторить
              </button>
            </div>
          ) : openProduct ? (
            <ProductDetail
              key={openProduct.id}
              product={openProduct}
              products={products}
              onBack={handleBack}
              onCategory={(cat) => {
                setActiveCategories([cat])
                navigate('/')
              }}
              onBrand={(b) => {
                setActiveBrands([b])
                navigate('/')
              }}
            />
          ) : route.name === 'product' ? (
            // Ссылка на снятый/несуществующий товар: не молчим и не показываем
            // главную (иначе кажется, что сайт сломан), а сообщаем явно.
            <main className="state state--notfound">
              <p className="empty__title">Товар не найден</p>
              <p className="empty__hint">
                Возможно, он снят с продажи или ссылка устарела. Посмотрите каталог — подберём
                похожее.
              </p>
              <a className="btn btn--primary" href="/">
                Смотреть каталог
              </a>
            </main>
          ) : (
            <>
              <section className="hero">
                <div className="hero__inner">
                  <div className="hero__copy">
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
                      {['В наличии на складе', 'Самовывоз из магазина', 'Понятные цены'].map(
                        (b) => (
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
                        ),
                      )}
                    </ul>
                  </div>
                  <div className="hero__art" aria-hidden="true">
                    <HeroArt />
                  </div>
                </div>
              </section>

              <main className="catalog" id="catalog">
                {/* Скрытый заголовок раздела: даёт цепочку h1(hero)→h2→h3(карточки),
                    иначе карточки-h3 «перепрыгивали» уровень (heading-order). */}
                <h2 className="sr-only">Каталог товаров</h2>
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
                  onReset={resetFilters}
                />
                <div className="catalog__main">
                  <ProductGrid
                    products={visibleProducts}
                    total={filtered.length}
                    onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    highlight={deferredQuery.trim()}
                    onReset={resetFilters}
                    animate={animateCards}
                    categories={categories}
                    onPickCategory={(cat) => {
                      resetFilters()
                      setActiveCategories([cat])
                    }}
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
              <svg className="footer__logo-mark" viewBox="0 0 32 32" aria-hidden="true">
                <path
                  d="M16 3 C16 3 6 14 6 21 a10 10 0 0 0 20 0 C26 14 16 3 16 3 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M11 21 a5 5 0 0 0 5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="footer__logo-text">
                Аквалин<span className="logo__dot">.</span>
              </span>
            </span>
            <p className="footer__tagline">
              Смесители, раковины, унитазы и душевые системы. Оплата при получении, самовывоз из
              магазина.
            </p>
            <div className="footer__socials">
              <a
                className="footer__social"
                href={STORE_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Мы в Telegram"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M21.5 4 L2.8 11.3 a0.4 0.4 0 0 0 0 0.75 L7 13.4 l1.7 5.2 a0.4 0.4 0 0 0 0.7 0.14 l2.4 -2.9 l4.6 3.4 a0.4 0.4 0 0 0 0.63 -0.24 L21.98 4.5 A0.4 0.4 0 0 0 21.5 4 Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 13.4 L16.5 7.2 L9.2 14.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a className="footer__social" href={STORE_PHONE_HREF} aria-label="Позвонить">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6.5 3 H9 l1.5 4.5 -2 1.4 a11 11 0 0 0 5.1 5.1 l1.4 -2 L19.5 15 v2.5 a2 2 0 0 1 -2.2 2 A15.5 15.5 0 0 1 4.5 6.2 a2 2 0 0 1 2 -3.2 z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a className="footer__social" href={STORE_EMAIL_HREF} aria-label="Написать на почту">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M4 7 L12 13 L20 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>

          <nav className="footer__col" aria-label="Покупателю">
            <h2 className="footer__head">Покупателю</h2>
            <a className="footer__link" href="/guides">
              Как выбрать
            </a>
            <a className="footer__link" href="/warranty">
              Гарантия
            </a>
            <a className="footer__link" href="/returns">
              Возврат и обмен
            </a>
          </nav>

          <nav className="footer__col" aria-label="Магазин">
            <h2 className="footer__head">Магазин</h2>
            <a className="footer__link" href="/contacts">
              Контакты
            </a>
            <a className="footer__link" href="/privacy">
              Политика конфиденциальности
            </a>
          </nav>

          <div className="footer__col">
            <h2 className="footer__head">Где нас найти</h2>
            <a className="footer__link" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              {STORE_ADDRESS}
            </a>
            <span className="footer__muted">{STORE_HOURS}</span>
            <a className="footer__link" href={STORE_PHONE_HREF}>
              {STORE_PHONE}
            </a>
            <a className="footer__link" href={STORE_EMAIL_HREF}>
              {STORE_EMAIL}
            </a>
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
      {/* Прячем cookie-баннер, пока открыт нижний CTA (корзина/оформление) — иначе
          фиксированный снизу баннер перекрывал бы их кнопки. */}
      <CookieBanner suppressed={cartOpen || checkoutOpen} />
    </div>
  )
}
