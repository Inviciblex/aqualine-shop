import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminOrders, setOrderStatus, extendOrder } from './admin-api.js'

const STATUS_LABELS = {
  new: 'Принят',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
}
const PAYMENT = { card: 'Картой при получении', cash: 'Наличными' }
const ACTIVE = new Set(['new', 'confirmed'])

const rub = (v) => new Intl.NumberFormat('ru-RU').format(v || 0) + ' ₽'

function fmtDate(iso) {
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
function fmtDay(v) {
  try {
    return new Date(v).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}
// Момент окончания брони (мс) из hold_until сервера; иначе не считаем просрочку.
function holdUntilMs(o) {
  if (!o.holdUntil) return null
  const t = new Date(o.holdUntil).getTime()
  return Number.isFinite(t) ? t : null
}

// Экспорт видимых заказов в CSV (BOM — чтобы Excel открыл кириллицу как UTF-8).
function toCSV(orders) {
  const cols = [
    'id',
    'createdAt',
    'status',
    'name',
    'phone',
    'payment',
    'comment',
    'total',
    'items',
  ]
  const escCsv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  const rows = orders.map((o) =>
    cols
      .map((c) => {
        if (c === 'items')
          return escCsv(
            (o.items || []).map((it) => `${it.name} x${it.qty} = ${it.price * it.qty}`).join('; '),
          )
        if (c === 'status') return escCsv(STATUS_LABELS[o.status] || o.status)
        return escCsv(o[c])
      })
      .join(','),
  )
  return '﻿' + cols.join(',') + '\n' + rows.join('\n')
}
function downloadCSV(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function OrderCard({ order, statuses, onChanged }) {
  const [status, setStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [extBusy, setExtBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => setStatus(order.status), [order.status])

  const active = ACTIVE.has(order.status)
  const hold = holdUntilMs(order)
  const overdue = active && hold != null && Date.now() > hold
  const dim = order.status === 'done' || order.status === 'cancelled'

  async function save() {
    setSaving(true)
    setErr('')
    setSaved(false)
    try {
      await setOrderStatus(order.id, status)
      onChanged({ ...order, status })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function extend(days) {
    setExtBusy(true)
    setErr('')
    try {
      const data = await extendOrder(order.id, days)
      onChanged({ ...order, holdUntil: data.holdUntil })
    } catch (e) {
      setErr(e.message)
    } finally {
      setExtBusy(false)
    }
  }

  return (
    <div
      className={`adm-order${dim ? ' adm-order--dim' : ''}${overdue ? ' adm-order--overdue' : ''}`}
    >
      <div className="adm-order__head">
        <div>
          <div className="adm-order__id">
            {order.id}
            {order.notified === false && (
              <span
                className="adm-badge adm-badge--warn"
                title="Уведомление в Telegram не доставлено"
              >
                ⚠ не уведомлён
              </span>
            )}
            {overdue && (
              <span
                className="adm-badge adm-badge--overdue"
                title="Срок хранения истёк — продлите бронь или свяжитесь с клиентом"
              >
                ⏰ просрочена
              </span>
            )}
          </div>
          <div className="adm-order__date">{fmtDate(order.createdAt)}</div>
        </div>
        <div className="adm-order__statusctl">
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
          <button className="adm-btn" onClick={save} disabled={saving}>
            Сохранить
          </button>
          {saved && <span className="adm-ok">✓</span>}
        </div>
      </div>

      <div className="adm-order__cust">
        <b>{order.name}</b> · {order.phone} · {PAYMENT[order.payment] || order.payment}
        {order.comment ? (
          <>
            <br />
            Комментарий: {order.comment}
          </>
        ) : null}
      </div>

      <ul className="adm-order__items">
        {(order.items || []).map((it, i) => (
          <li key={i}>
            <span>
              {it.name} <span className="adm-muted adm-mono">× {it.qty}</span>
            </span>
            <span className="adm-mono">{rub(it.price * it.qty)}</span>
          </li>
        ))}
      </ul>

      {active && (
        <div className="adm-order__hold">
          <span className="adm-muted">
            {hold != null ? (
              <>
                Бронь до <b className="adm-mono">{fmtDay(hold)}</b>
              </>
            ) : (
              'Срок брони не задан'
            )}
          </span>
          <span className="adm-order__extbtns">
            <button className="adm-btn adm-btn--ghost" onClick={() => extend(2)} disabled={extBusy}>
              +2 дня
            </button>
            <button className="adm-btn adm-btn--ghost" onClick={() => extend(7)} disabled={extBusy}>
              +7 дней
            </button>
          </span>
        </div>
      )}

      <div className="adm-order__foot">
        <span className="adm-muted">Итого</span>
        <span className="adm-order__total">{rub(order.total)}</span>
      </div>

      {err && <p className="adm-err">{err}</p>}
    </div>
  )
}

export default function OrdersTab() {
  const [orders, setOrders] = useState([])
  const [statuses, setStatuses] = useState(['new', 'confirmed', 'done', 'cancelled'])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const data = await adminOrders()
      setStatuses(data.statuses || statuses)
      setOrders(data.orders || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
    // statuses намеренно вне зависимостей — используем как фолбэк, не триггер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return orders.filter((o) => {
      const okStatus = !statusFilter || o.status === statusFilter
      const hay = `${o.id} ${o.name || ''} ${o.phone || ''}`.toLowerCase()
      return okStatus && (!needle || hay.includes(needle))
    })
  }, [orders, q, statusFilter])

  function onChanged(next) {
    setOrders((list) => list.map((o) => (o.id === next.id ? next : o)))
  }

  return (
    <section>
      <div className="adm-toolbar">
        <input
          className="adm-input"
          type="search"
          placeholder="Поиск по номеру, имени, телефону"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="adm-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Все статусы</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] || s}
            </option>
          ))}
        </select>
        <button className="adm-btn adm-btn--ghost" onClick={load} disabled={loading}>
          Обновить
        </button>
        <button
          className="adm-btn adm-btn--ghost"
          onClick={() => {
            if (!filtered.length) return
            const stamp = new Date().toISOString().slice(0, 10)
            downloadCSV(`zakazy-${stamp}.csv`, toCSV(filtered))
          }}
          disabled={!filtered.length}
        >
          Экспорт CSV
        </button>
        <span className="adm-muted adm-toolbar__count">
          {filtered.length ? `Всего: ${filtered.length}` : ''}
        </span>
      </div>

      {err && <p className="adm-err">{err}</p>}
      {loading ? (
        <p className="adm-muted">Загрузка…</p>
      ) : !filtered.length ? (
        <p className="adm-muted">Броней пока нет.</p>
      ) : (
        <div className="adm-orders">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} statuses={statuses} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}
