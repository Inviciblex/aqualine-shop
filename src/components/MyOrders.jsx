import { useEffect, useState } from 'react'
import { getOrders, updateOrderStatus, STATUS_LABELS, isOverdue } from '../orders.js'
import { statusUrl } from '../sendOrder.js'
import { formatPrice, copyText } from '../utils.js'
import { HOLD_DAYS } from '../store.js'

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
  const [copiedId, setCopiedId] = useState(null)

  async function copyId(id) {
    if (await copyText(id)) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000)
    }
  }

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
      <h1 className="orders__title">Мои брони</h1>
      {orders.length > 0 && (
        <p className="orders__lead">
          На выдаче назовите номер брони — по нему мы найдём ваш заказ. Если номера нет под рукой,
          подойдёт телефон, на который оформляли.
        </p>
      )}

      {orders.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Броней пока нет</p>
          <p className="empty__hint">Оформленные брони появятся здесь, на этом устройстве.</p>
        </div>
      ) : (
        <div className="orders__list">
          {orders.map((o) => (
            <article className="order" key={o.id}>
              <div className="order__head">
                <span className="order__id-group">
                  <span className="order__id">{o.id}</span>
                  <button
                    type="button"
                    className="order__copy"
                    onClick={() => copyId(o.id)}
                    aria-label={`Копировать номер брони ${o.id}`}
                  >
                    {copiedId === o.id ? 'Скопировано ✓' : 'Копировать'}
                  </button>
                </span>
                <span className="order__status-group">
                  {isOverdue(o) && (
                    <span
                      className="order__overdue"
                      title={`Срок брони — ${HOLD_DAYS} дн. — истёк`}
                    >
                      Просрочена
                    </span>
                  )}
                  <span className={`status status--${o.status}`}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </span>
              </div>
              <div className="order__date">{formatDate(o.createdAt)}</div>
              {isOverdue(o) && (
                <p className="order__overdue-hint">
                  Срок хранения брони истёк. Уточните в магазине, актуальна ли она ещё, — возможно,
                  товар уже сняли с резерва.
                </p>
              )}
              <ul className="order__items">
                {o.items.map((it, i) => (
                  <li key={i}>
                    <span>
                      {it.id ? (
                        <a className="order__item-link" href={`#/product/${it.id}`}>
                          {it.name}
                        </a>
                      ) : (
                        it.name
                      )}{' '}
                      <span className="order__mult">× {it.qty}</span>
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
