import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../utils.js'

export default function Header({ onOpenCart }) {
  const { totalQty, totalSum } = useCart()

  return (
    <header className="header">
      <div className="header__inner">
        <a className="logo" href="#/" aria-label="Аквалин — на главную">
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
          <a className="header__link" href="#/orders">Мои заказы</a>
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
        </div>
      </div>
    </header>
  )
}
