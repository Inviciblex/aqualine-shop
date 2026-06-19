import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../utils.js'

function QtyControl({ item, setQty }) {
  return (
    <div className="qty">
      <button
        className="qty__btn"
        onClick={() => setQty(item.product.id, item.qty - 1)}
        aria-label="Уменьшить количество"
      >
        −
      </button>
      <span className="qty__value">{item.qty}</span>
      <button
        className="qty__btn"
        onClick={() => setQty(item.product.id, item.qty + 1)}
        aria-label="Увеличить количество"
      >
        +
      </button>
    </div>
  )
}

export default function CartDrawer({ open, onClose, onCheckout }) {
  const { items, setQty, removeItem, totalSum, totalQty } = useCart()

  return (
    <>
      <div
        className={`overlay ${open ? 'overlay--visible' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`drawer ${open ? 'drawer--open' : ''}`}
        aria-label="Корзина"
        aria-hidden={!open}
      >
        <div className="drawer__head">
          <h2 className="drawer__title">Корзина</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть корзину">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <div className="drawer__empty">
            <p className="empty__title">Корзина пуста</p>
            <p className="empty__hint">Добавьте товары из каталога — они появятся здесь.</p>
          </div>
        ) : (
          <>
            <div className="drawer__items">
              {items.map((item) => (
                <div className="cart-item" key={item.product.id}>
                  <div className="cart-item__info">
                    <span className="cart-item__name">{item.product.name}</span>
                    <span className="cart-item__sku">{item.product.sku}</span>
                    <span className="cart-item__price">
                      {formatPrice(item.product.price)}
                    </span>
                  </div>
                  <div className="cart-item__controls">
                    <QtyControl item={item} setQty={setQty} />
                    <button
                      className="cart-item__remove"
                      onClick={() => removeItem(item.product.id)}
                      aria-label="Удалить товар"
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="cart-item__sum">
                    {formatPrice(item.product.price * item.qty)}
                  </div>
                </div>
              ))}
            </div>

            <div className="drawer__foot">
              <div className="drawer__total">
                <span>Итого ({totalQty} шт.)</span>
                <span className="drawer__total-sum">{formatPrice(totalSum)}</span>
              </div>
              <button className="btn btn--primary btn--block" onClick={onCheckout}>
                Оформить заказ
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
