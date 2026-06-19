import { useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice, formatPhoneInput, normalizePhone } from '../utils.js'
import { sendOrder } from '../sendOrder.js'
import { saveOrder } from '../orders.js'

const EMPTY = { name: '', phone: '', payment: 'card', comment: '' }

export default function Checkout({ open, onClose }) {
  const { items, totalSum, totalQty, clearCart } = useCart()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [done, setDone] = useState(null) // { orderId, sum, qty }

  if (!open) return null

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  // Телефон форматируем маской прямо при вводе.
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))

  function validate() {
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Укажите имя'
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length < 11) next.phone = 'Укажите телефон полностью'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (!validate() || sending) return

    const customer = { ...form, phone: normalizePhone(form.phone) }
    const orderItems = items.map((i) => ({
      sku: i.product.sku,
      name: i.product.name,
      qty: i.qty,
      price: i.product.price,
    }))
    const order = { customer, items: orderItems, total: totalSum }

    setSendError('')
    setSending(true)
    const result = await sendOrder(order)
    setSending(false)

    // Ошибка отправки (кроме демо-режима) — не очищаем корзину, даём повторить.
    if (!result.ok) {
      setSendError('Не удалось оформить заказ. Проверьте соединение и попробуйте ещё раз.')
      return
    }

    // Сохраняем заказ в историю устройства (страница «Мои заказы»).
    saveOrder({
      id: result.id,
      status: 'new',
      createdAt: new Date().toISOString(),
      total: totalSum,
      items: orderItems,
      customer,
      demo: Boolean(result.demo),
    })

    setDone({ orderId: result.id, sum: totalSum, qty: totalQty })
    clearCart()
  }

  function closeAll() {
    setForm(EMPTY)
    setErrors({})
    setSendError('')
    setSending(false)
    setDone(null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={closeAll}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {done ? (
          <div className="success">
            <div className="success__mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="24" cy="24" r="20" />
                <path d="M16 24 l6 6 l10 -12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="modal__title">Заказ оформлен</h2>
            <p className="success__text">
              Номер заказа <strong>{done.orderId}</strong>. Сумма {formatPrice(done.sum)} за{' '}
              {done.qty} шт. Мы свяжемся с вами для подтверждения.
            </p>
            <button className="btn btn--primary btn--block" onClick={closeAll}>
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="modal__head">
              <h2 className="modal__title">Оформление заказа</h2>
              <button className="icon-btn" onClick={closeAll} aria-label="Закрыть">
                ✕
              </button>
            </div>

            <form className="form" onSubmit={submit} noValidate>
              <div className="form__field">
                <label className="form__label" htmlFor="co-name">Имя</label>
                <input
                  id="co-name"
                  className={`input ${errors.name ? 'input--error' : ''}`}
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Как к вам обращаться"
                />
                {errors.name && <span className="form__error">{errors.name}</span>}
              </div>

              <div className="form__field">
                <label className="form__label" htmlFor="co-phone">Телефон</label>
                <input
                  id="co-phone"
                  className={`input ${errors.phone ? 'input--error' : ''}`}
                  value={form.phone}
                  onChange={updatePhone}
                  placeholder="+7 (___) ___-__-__"
                  inputMode="tel"
                />
                {errors.phone && <span className="form__error">{errors.phone}</span>}
              </div>

              <div className="form__field">
                <span className="form__label">Оплата</span>
                <div className="radio-row">
                  <label className={`radio ${form.payment === 'card' ? 'radio--on' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      checked={form.payment === 'card'}
                      onChange={() => setForm((f) => ({ ...f, payment: 'card' }))}
                    />
                    Картой при получении
                  </label>
                  <label className={`radio ${form.payment === 'cash' ? 'radio--on' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      checked={form.payment === 'cash'}
                      onChange={() => setForm((f) => ({ ...f, payment: 'cash' }))}
                    />
                    Наличными
                  </label>
                </div>
              </div>

              <div className="form__field">
                <label className="form__label" htmlFor="co-comment">Комментарий</label>
                <textarea
                  id="co-comment"
                  className="input"
                  rows={2}
                  value={form.comment}
                  onChange={update('comment')}
                  placeholder="Необязательно"
                />
              </div>

              <div className="form__total">
                <span>К оплате ({totalQty} шт.)</span>
                <span className="form__total-sum">{formatPrice(totalSum)}</span>
              </div>

              {sendError && <p className="form__error form__error--block">{sendError}</p>}

              <button className="btn btn--primary btn--block" type="submit" disabled={sending}>
                {sending ? 'Отправляем…' : 'Подтвердить заказ'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
