import { useEffect, useState } from 'react'
import {
  getOrders,
  updateOrderStatus,
  STATUS_LABELS,
  ACTIVE_STATUSES,
  isOverdue,
  holdUntilMs,
} from '../orders.js'
import { fetchStatus, cancelOrder } from '../sendOrder.js'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice, copyText } from '../utils.js'

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

// Только дата — для срока брони («держим до …»).
function formatDay(ms) {
  try {
    return new Date(ms).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function MyOrders({ onBack, products = [] }) {
  const { addItem, openCart } = useCart()
  const [orders, setOrders] = useState(() => getOrders())
  const [copiedId, setCopiedId] = useState(null)
  const [cancelling, setCancelling] = useState(null) // id брони в процессе отмены
  const [cancelError, setCancelError] = useState(null) // { id, msg }
  const [repeatNote, setRepeatNote] = useState(null) // { id, msg }

  // Повторить бронь: добавляем позиции в корзину по АКТУАЛЬНОМУ каталогу (цена и
  // наличие берутся из каталога, не из старого заказа). Пропавшие — пропускаем.
  function handleRepeat(o) {
    let added = 0
    let missing = 0
    for (const it of o.items || []) {
      const p = products.find((pr) => pr.id === it.id)
      if (p) {
        addItem(p, it.qty)
        added += 1
      } else {
        missing += 1
      }
    }
    if (added) openCart()
    if (missing) {
      setRepeatNote({ id: o.id, msg: `${missing} товаров из брони больше нет в каталоге` })
    } else if (!added) {
      setRepeatNote({ id: o.id, msg: 'Товары из этой брони сейчас недоступны' })
    } else {
      setRepeatNote(null)
    }
  }

  async function copyId(id) {
    if (await copyText(id)) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000)
    }
  }

  // Клиент отменяет свою бронь. Сервер сверяет телефон (он есть в сохранённом
  // заказе на устройстве) — иначе номер брони можно было бы перебрать.
  async function handleCancel(o) {
    const phone = o.customer?.phone
    if (!phone) return
    if (!window.confirm(`Отменить бронь ${o.id}? Восстановить её будет нельзя.`)) return
    setCancelError(null)
    setCancelling(o.id)
    const res = await cancelOrder(o.id, phone)
    setCancelling(null)
    if (res.ok) {
      updateOrderStatus(o.id, 'cancelled')
      setOrders(getOrders())
    } else if (res.reason === 'not-cancellable' && res.status) {
      // На сервере статус уже сменился (напр. менеджер подтвердил/выполнил) —
      // подтягиваем актуальный и показываем его.
      updateOrderStatus(o.id, res.status)
      setOrders(getOrders())
      setCancelError({ id: o.id, msg: 'Статус брони изменился — отмена уже недоступна.' })
    } else {
      setCancelError({ id: o.id, msg: 'Не удалось отменить. Проверьте связь или позвоните нам.' })
    }
  }

  // Подтягиваем актуальные статусы с бэкенда параллельно (одним заходом), затем
  // один setState — без каскада ре-рендеров и повторных чтений localStorage.
  useEffect(() => {
    let cancelled = false
    const real = getOrders().filter((o) => !o.demo)
    if (!real.length) return
    ;(async () => {
      const results = await Promise.all(
        real.map(async (o) => {
          const r = await fetchStatus(o.id)
          if (!r.ok) return null
          // Ловим и изменение срока: менеджер мог продлить бронь, не меняя статус.
          const statusChanged = r.status && r.status !== o.status
          const holdChanged = r.holdUntil && r.holdUntil !== o.holdUntil
          return statusChanged || holdChanged
            ? { id: o.id, status: r.status || o.status, holdUntil: r.holdUntil }
            : null
        }),
      )
      if (cancelled) return
      const changed = results.filter(Boolean)
      if (changed.length) {
        for (const c of changed) updateOrderStatus(c.id, c.status, c.holdUntil)
        setOrders(getOrders())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="orders">
      <a className="back" href="/" onClick={onBack}>
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
                      title={`Срок хранения истёк ${formatDay(holdUntilMs(o))}`}
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
              {ACTIVE_STATUSES.includes(o.status) && !isOverdue(o) && (
                <p className="order__hold">Держим бронь до {formatDay(holdUntilMs(o))}</p>
              )}
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
                        <a className="order__item-link" href={`/product/${it.id}`}>
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
              <div className="order__actions">
                {o.items?.length > 0 && (
                  <button type="button" className="order__repeat" onClick={() => handleRepeat(o)}>
                    Повторить бронь
                  </button>
                )}
                {!o.demo && o.customer?.phone && ACTIVE_STATUSES.includes(o.status) && (
                  <button
                    type="button"
                    className="order__cancel"
                    onClick={() => handleCancel(o)}
                    disabled={cancelling === o.id}
                  >
                    {cancelling === o.id ? 'Отменяем…' : 'Отменить бронь'}
                  </button>
                )}
              </div>
              {repeatNote?.id === o.id && <p className="order__note">{repeatNote.msg}</p>}
              {cancelError?.id === o.id && (
                <p className="order__cancel-error" role="alert">
                  {cancelError.msg}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
