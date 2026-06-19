import { useEffect, useState } from 'react'
import { getOrders, updateOrderStatus, STATUS_LABELS } from '../orders.js'
import { statusUrl } from '../sendOrder.js'
import { formatPrice } from '../utils.js'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function MyOrders({ onBack }) {
  const [orders, setOrders] = useState(() => getOrders())

  // Подтягиваем актуальный статус с бэкенда (если он настроен).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const o of orders) {
        if (o.demo) continue
        const url = statusUrl(o.id)
        if (!url) break
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const data = await res.json()
          if (!cancelled && data.ok && data.status && data.status !== o.status) {
            updateOrderStatus(o.id, data.status)
            setOrders(getOrders())
          }
        } catch {
          // оффлайн — оставляем сохранённый статус
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="orders">
      <a className="back" href="#/" onClick={onBack}>
        <span aria-hidden="true">←</span> В каталог
      </a>
      <h1 className="orders__title">Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Заказов пока нет</p>
          <p className="empty__hint">Оформленные заказы появятся здесь, на этом устройстве.</p>
        </div>
      ) : (
        <div className="orders__list">
          {orders.map((o) => (
            <article className="order" key={o.id}>
              <div className="order__head">
                <span className="order__id">{o.id}</span>
                <span className={`status status--${o.status}`}>
                  {STATUS_LABELS[o.status] || o.status}
                </span>
              </div>
              <div className="order__date">{formatDate(o.createdAt)}</div>
              <ul className="order__items">
                {o.items.map((it, i) => (
                  <li key={i}>
                    <span>
                      {it.name} <span className="order__mult">× {it.qty}</span>
                    </span>
                    <span className="order__line-sum">{formatPrice(it.price * it.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="order__total">
                <span>Итого</span>
                <span className="order__total-sum">{formatPrice(o.total)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
