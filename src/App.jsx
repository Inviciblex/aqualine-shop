import { useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from './catalog.js'
import Header from './components/Header.jsx'
import Filters from './components/Filters.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import ProductDetail from './components/ProductDetail.jsx'
import RecentlyViewed from './components/RecentlyViewed.jsx'
import MyOrders from './components/MyOrders.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import Checkout from './components/Checkout.jsx'
import Toast from './components/Toast.jsx'

// Маршрут из хеша: #/product/3 → товар, #/orders → заказы, иначе каталог.
function parseRoute() {
  const h = window.location.hash
  const m = h.match(/^#\/product\/(\d+)/)
  if (m) return { name: 'product', id: Number(m[1]) }
  if (/^#\/orders/.test(h)) return { name: 'orders' }
  return { name: 'catalog' }
}

// Восстановление фильтров из sessionStorage (переживает возврат и перезагрузку).
const SS = window.sessionStorage
const readSS = (key, fallback) => {
  try {
    const v = SS.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

export default function App() {
  const { categories, products, status } = useCatalog()

  const [query, setQuery] = useState(() => readSS('f_query', ''))
  const [activeCategories, setActiveCategories] = useState(() => readSS('f_cats', []))
  const [priceLimit, setPriceLimit] = useState(() => readSS('f_price', null))
  const [sort, setSort] = useState(() => readSS('f_sort', 'default'))
  const [inStockOnly, setInStockOnly] = useState(() => readSS('f_instock', false))

  // Поиск с задержкой: query — то, что в поле; deferredQuery — то, по чему фильтруем.
  const [deferredQuery, setDeferredQuery] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setDeferredQuery(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [route, setRoute] = useState(parseRoute)

  const prevRouteName = useRef(route.name)
  const catalogScroll = useRef(readSS('f_scroll', 0))

  const maxPrice = useMemo(
    () => (products.length ? Math.max(...products.map((p) => p.price)) : 0),
    [products],
  )

  useEffect(() => {
    if (status === 'ready' && priceLimit === null) setPriceLimit(maxPrice)
  }, [status, maxPrice, priceLimit])

  // Сохраняем фильтры
  useEffect(() => { try { SS.setItem('f_query', JSON.stringify(query)) } catch {} }, [query])
  useEffect(() => { try { SS.setItem('f_cats', JSON.stringify(activeCategories)) } catch {} }, [activeCategories])
  useEffect(() => { try { SS.setItem('f_price', JSON.stringify(priceLimit)) } catch {} }, [priceLimit])
  useEffect(() => { try { SS.setItem('f_sort', JSON.stringify(sort)) } catch {} }, [sort])
  useEffect(() => { try { SS.setItem('f_instock', JSON.stringify(inStockOnly)) } catch {} }, [inStockOnly])

  // Навигация: при уходе из каталога запоминаем позицию прокрутки.
  useEffect(() => {
    const onHash = () => {
      if (prevRouteName.current === 'catalog') {
        catalogScroll.current = window.scrollY
        try { SS.setItem('f_scroll', JSON.stringify(window.scrollY)) } catch {}
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
    setActiveCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    )
  const clearCategories = () => setActiveCategories([])

  function handleBack(e) {
    if (window.history.length > 1) {
      e.preventDefault()
      window.history.back()
    }
  }

  const openProduct =
    route.name === 'product' ? products.find((p) => p.id === route.id) : null

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    let list = products.filter((p) => {
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      const matchesCategory =
        activeCategories.length === 0 || activeCategories.includes(p.category)
      const matchesPrice = priceLimit === null || p.price <= priceLimit
      const matchesStock = !inStockOnly || p.inStock
      return matchesQuery && matchesCategory && matchesPrice && matchesStock
    })

    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    return list
  }, [products, deferredQuery, activeCategories, priceLimit, sort, inStockOnly])

  function resetFilters() {
    setQuery('')
    setActiveCategories([])
    setInStockOnly(false)
    setPriceLimit(maxPrice)
    setSort('default')
  }

  return (
    <div className="app">
      <Header onOpenCart={() => setCartOpen(true)} />

      {route.name === 'orders' ? (
        <MyOrders onBack={handleBack} />
      ) : status === 'loading' ? (
        <div className="state">Загрузка каталога…</div>
      ) : status === 'error' ? (
        <div className="state state--error">
          <p className="empty__title">Не удалось загрузить каталог</p>
          <p className="empty__hint">
            Проверьте источник товаров: файл <code>products.json</code> рядом с сайтом
            или адрес Google Таблицы в настройках.
          </p>
        </div>
      ) : openProduct ? (
        <ProductDetail
          key={openProduct.id}
          product={openProduct}
          products={products}
          onBack={handleBack}
        />
      ) : (
        <>
          <section className="hero">
            <div className="hero__inner">
              <p className="hero__eyebrow">Сантехника с доставкой</p>
              <h1 className="hero__title">
                Всё для воды в доме —<br />от смесителя до инсталляции.
              </h1>
              <p className="hero__lead">
                Проверенные смесители, раковины, унитазы и душевые системы. Понятные цены,
                наличие на складе, доставка по городу.
              </p>
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
              maxPrice={maxPrice}
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
                products={filtered}
                highlight={deferredQuery.trim()}
                onReset={resetFilters}
              />
              <RecentlyViewed products={products} />
            </div>
          </main>
        </>
      )}

      <footer className="footer">
        <div className="footer__inner">
          <span>
            Аквалин<span className="logo__dot">.</span>
          </span>
          <span className="footer__note">Демо-магазин. Замените контакты и товары на свои.</span>
        </div>
      </footer>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
      />
      <Checkout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      <Toast />
    </div>
  )
}
