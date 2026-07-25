import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatPrice } from '../utils.js'
import { effectiveTheme, storeTheme } from '../theme.js'
import { activeOrdersCount, subscribeOrders } from '../orders.js'
import { subscribe, parseRoute } from '../router.js'

export default function Header({ onOpenCart }) {
  const { totalQty, totalSum } = useCart()
  const { count: favCount } = useFavorites()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState(effectiveTheme)
  const [activeOrders, setActiveOrders] = useState(activeOrdersCount)
  const [scrolled, setScrolled] = useState(false)
  const [routeName, setRouteName] = useState(() => parseRoute().name)
  const closeMenu = () => setMenuOpen(false)

  // Бейдж активных броней (Принят/Подтверждён) + подсветка активного раздела.
  // Обновляются при оформлении, подтягивании статусов в «Моих бронях» (pub/sub),
  // возврате на вкладку и навигации между разделами.
  useEffect(() => {
    const update = () => {
      setActiveOrders(activeOrdersCount())
      setRouteName(parseRoute().name)
    }
    const unsub = subscribeOrders(update)
    const unsubNav = subscribe(update) // смена раздела (History-роутинг)
    window.addEventListener('focus', update)
    return () => {
      unsub()
      unsubNav()
      window.removeEventListener('focus', update)
    }
  }, [])

  // Плавающая шапка «матовеет» после небольшого скролла: вверху страницы она
  // прозрачна и сливается с hero, при прокрутке — стекло с размытием.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Переключение темы с круговым «раскрытием» из точки клика (View Transitions).
  // Деградирует до мгновенной смены без поддержки API или при reduce-motion.
  const toggleTheme = (e) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const apply = () => {
      storeTheme(next)
      setTheme(next)
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || reduce) {
      apply()
      return
    }
    const btn = e.currentTarget.getBoundingClientRect()
    const x = e.clientX || btn.left + btn.width / 2
    const y = e.clientY || btn.top + btn.height / 2
    const root = document.documentElement
    root.style.setProperty('--theme-x', `${x}px`)
    root.style.setProperty('--theme-y', `${y}px`)
    // flushSync: DOM должен обновиться синхронно внутри колбэка, иначе снимок
    // перехода не поймает новую тему.
    document.startViewTransition(() => flushSync(apply))
  }

  // На мобиле меню закрывается по клику вне шапки и по Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (!e.target.closest('.header')) setMenuOpen(false)
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen])

  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="header__inner">
        <a className="logo" href="/" aria-label="Аквалин — на главную" onClick={closeMenu}>
          <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
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
          <span className="logo__text">
            Аквалин<span className="logo__dot">.</span>
          </span>
        </a>

        <div className="header__actions">
          <nav
            className={`header__nav ${menuOpen ? 'header__nav--open' : ''}`}
            aria-label="Разделы"
          >
            <a
              className={`header__link ${routeName === 'contacts' ? 'header__link--active' : ''}`}
              href="/contacts"
              onClick={closeMenu}
              aria-current={routeName === 'contacts' ? 'page' : undefined}
            >
              Контакты
            </a>
            <a
              className={`header__link ${routeName === 'favorites' ? 'header__link--active' : ''}`}
              href="/favorites"
              onClick={closeMenu}
              aria-current={routeName === 'favorites' ? 'page' : undefined}
            >
              Избранное{favCount > 0 && <span className="header__badge">{favCount}</span>}
            </a>
            <a
              className={`header__link ${routeName === 'orders' ? 'header__link--active' : ''}`}
              href="/orders"
              onClick={closeMenu}
              aria-current={routeName === 'orders' ? 'page' : undefined}
            >
              Мои брони
              {activeOrders > 0 && (
                <span className="header__badge" title="Активные брони (приняты или подтверждены)">
                  {activeOrders}
                </span>
              )}
            </a>
            <a
              className={`header__link ${routeName === 'account' ? 'header__link--active' : ''}`}
              href="/account"
              onClick={closeMenu}
              aria-current={routeName === 'account' ? 'page' : undefined}
            >
              {user?.name ? user.name : 'Кабинет'}
            </a>
          </nav>

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          {/* Имя кнопки собираем из содержимого (sr-only-префикс), а не aria-label:
              видимый текст (цена/счётчик) тогда всегда часть доступного имени —
              иначе label-in-name ломается (в т.ч. на склонении «Корзина/корзину»).
              Счётчик прячем от скринридера (aria-hidden) — его дублирует префикс. */}
          <button className="cart-button" onClick={onOpenCart}>
            <span className="sr-only">
              Открыть корзину{totalQty > 0 ? `, товаров: ${totalQty}` : ''}.{' '}
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 7 h14 l-1.2 10 a2 2 0 0 1 -2 1.8 H8.2 a2 2 0 0 1 -2 -1.8 z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M9 7 V6 a3 3 0 0 1 6 0 v1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            <span className="cart-button__label">
              {totalQty > 0 ? formatPrice(totalSum) : 'Корзина'}
            </span>
            {totalQty > 0 && (
              <span className="cart-button__badge" aria-hidden="true">
                {totalQty}
              </span>
            )}
          </button>

          <button
            className="header__burger"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? (
                <path
                  d="M6 6 L18 18 M18 6 L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7 H20 M4 12 H20 M4 17 H20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
            {(favCount > 0 || activeOrders > 0) && (
              <span className="header__burger-dot" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
