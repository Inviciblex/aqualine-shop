import { useEffect, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { formatPrice } from '../utils.js'

export default function Header({ onOpenCart }) {
  const { totalQty, totalSum } = useCart()
  const { count: favCount } = useFavorites()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  // На мобиле меню закрывается по клику вне шапки и по Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (!e.target.closest('.header')) setMenuOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen])

  return (
    <header className="header">
      <div className="header__inner">
        <a className="logo" href="#/" aria-label="Аквалин — на главную" onClick={closeMenu}>
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
            <a className="header__link" href="#/contacts" onClick={closeMenu}>Контакты</a>
            <a className="header__link" href="#/favorites" onClick={closeMenu}>
              Избранное{favCount > 0 && <span className="header__badge">{favCount}</span>}
            </a>
            <a className="header__link" href="#/orders" onClick={closeMenu}>Мои заказы</a>
          </nav>

          <button className="cart-button" onClick={onOpenCart} aria-label="Открыть корзину">
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
            {totalQty > 0 && <span className="cart-button__badge">{totalQty}</span>}
          </button>

          <button
            className="header__burger"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7 H20 M4 12 H20 M4 17 H20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
            {favCount > 0 && <span className="header__burger-dot" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
