import { useRef, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice, formatPhoneInput, normalizePhone, copyText } from '../utils.js'
import { validateCheckout } from '../checkout-validate.js'
import { sendOrder } from '../sendOrder.js'
import { saveOrder } from '../orders.js'
import { loadCustomer, saveCustomer } from '../customer.js'
import { useFavorites } from '../context/FavoritesContext.jsx'
import { useModalA11y } from '../useModalA11y.js'
import {
  STORE_ADDRESS,
  MAPS_URL,
  STORE_HOURS,
  HOLD_DAYS,
  STORE_PHONE_HREF,
  STORE_TELEGRAM_URL,
} from '../store.js'

const EMPTY = { name: '', phone: '', payment: 'card', comment: '', consent: false }
// Имя/телефон/оплату подставляем из сохранённых данных (после первого заказа).
// Согласие на ПДн и комментарий — всегда пустые (согласие даётся заново).
const initialForm = () => ({ ...EMPTY, ...loadCustomer() })

export default function Checkout({ open, onClose }) {
  const { items, totalSum, totalQty, clearCart } = useCart()
  const { removeMany } = useFavorites()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [done, setDone] = useState(null) // { orderId, sum, qty }
  const [itemsOpen, setItemsOpen] = useState(false) // раскрытый список товаров в «К оплате»
  const [copied, setCopied] = useState(false) // подтверждение копирования номера брони
  const modalRef = useRef(null)
  useModalA11y(modalRef, { active: open, onClose: closeAll })

  if (!open) return null

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  // Телефон форматируем маской прямо при вводе.
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))

  function validate() {
    const next = validateCheckout(form)
    setErrors(next)
    return next
  }

  // После неуспешной валидации переводим фокус на первое поле с ошибкой.
  function focusFirstError(errs) {
    const id = errs.name ? 'co-name' : errs.phone ? 'co-phone' : errs.consent ? 'co-consent' : null
    if (id) document.getElementById(id)?.focus()
  }

  async function submit(e) {
    e.preventDefault()
    if (sending) return
    const errs = validate()
    if (Object.keys(errs).length) {
      focusFirstError(errs)
      return
    }

    const customer = { ...form, phone: normalizePhone(form.phone) }
    const orderItems = items.map((i) => ({
      id: i.product.id,
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
      setSendError('Не удалось оформить бронь. Проверьте соединение и попробуйте ещё раз.')
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

    // Запоминаем контакты для автоподстановки в следующий раз.
    saveCustomer({ name: form.name, phone: form.phone, payment: form.payment })

    // Заказанные товары убираем из избранного.
    removeMany(items.map((i) => i.product.id))

    setDone({ orderId: result.id, sum: totalSum, qty: totalQty })
    clearCart()
  }

  function closeAll() {
    setForm(initialForm())
    setErrors({})
    setSendError('')
    setSending(false)
    setDone(null)
    setItemsOpen(false)
    setCopied(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={closeAll}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-title"
        ref={modalRef}
        tabIndex={-1}
      >
        {done ? (
          <div className="success">
            <div className="success__mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="24" cy="24" r="20" />
                <path d="M16 24 l6 6 l10 -12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="modal__title" id="co-title">
              Товар забронирован
            </h2>
            <div className="success__order">
              <span className="success__order-label">Номер брони</span>
              <div className="success__order-row">
                <span className="success__order-id">{done.orderId}</span>
                <button
                  type="button"
                  className="success__order-copy"
                  onClick={async () => {
                    if (await copyText(done.orderId)) {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }
                  }}
                >
                  {copied ? 'Скопировано ✓' : 'Копировать'}
                </button>
              </div>
              <span className="success__order-hint">
                Назовите этот номер при получении — по нему мы найдём вашу бронь.
              </span>
            </div>
            <p className="success__text">
              Сумма {formatPrice(done.sum)} за {done.qty} шт. Мы свяжемся с вами для подтверждения
              наличия.
            </p>
            <div className="success__pickup">
              <p className="success__pickup-title">Самовывоз</p>
              <a
                className="success__pickup-addr"
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {STORE_ADDRESS}
              </a>
              <p className="success__pickup-line">{STORE_HOURS}</p>
              <p className="success__pickup-line">
                Бронь держим {HOLD_DAYS} дн. Оплата при получении.
              </p>
            </div>
            <div className="success__contacts">
              <a className="success__contact" href={STORE_PHONE_HREF}>
                Позвонить
              </a>
              <a
                className="success__contact"
                href={STORE_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
              <a className="success__contact" href="/orders" onClick={closeAll}>
                Мои брони
              </a>
            </div>
            <button className="btn btn--primary btn--block" onClick={closeAll}>
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="modal__head">
              <h2 className="modal__title" id="co-title">
                Оформление брони
              </h2>
              <button className="icon-btn" onClick={closeAll} aria-label="Закрыть">
                ✕
              </button>
            </div>

            <form className="form" onSubmit={submit} noValidate>
              <p className="form__note">
                Только самовывоз из магазина — после подтверждения мы свяжемся с вами и согласуем
                время. Бронь держим {HOLD_DAYS} дн., оплата при получении.
              </p>
              <div className="form__field">
                <label className="form__label" htmlFor="co-name">
                  Имя
                  <span className="form__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="co-name"
                  className={`input ${errors.name ? 'input--error' : ''}`}
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Как к вам обращаться"
                  autoComplete="name"
                  aria-required="true"
                  aria-invalid={errors.name ? 'true' : undefined}
                  aria-describedby={errors.name ? 'co-name-err' : undefined}
                />
                {errors.name && (
                  <span className="form__error" id="co-name-err" role="alert">
                    {errors.name}
                  </span>
                )}
              </div>

              <div className="form__field">
                <label className="form__label" htmlFor="co-phone">
                  Телефон
                  <span className="form__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="co-phone"
                  className={`input ${errors.phone ? 'input--error' : ''}`}
                  value={form.phone}
                  onChange={updatePhone}
                  placeholder="+7 (___) ___-__-__"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-required="true"
                  aria-invalid={errors.phone ? 'true' : undefined}
                  aria-describedby={errors.phone ? 'co-phone-err' : undefined}
                />
                {errors.phone && (
                  <span className="form__error" id="co-phone-err" role="alert">
                    {errors.phone}
                  </span>
                )}
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
                <label className="form__label" htmlFor="co-comment">
                  Комментарий
                </label>
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
                <button
                  type="button"
                  className="form__total-toggle"
                  onClick={() => setItemsOpen((v) => !v)}
                  aria-expanded={itemsOpen}
                >
                  <span
                    className={`form__total-caret ${itemsOpen ? 'form__total-caret--open' : ''}`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path
                        d="M9 6 L15 12 L9 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  К оплате ({totalQty} шт.)
                </button>
                <span className="form__total-sum">{formatPrice(totalSum)}</span>
              </div>
              {itemsOpen && (
                <ul className="order-items">
                  {items.map((i) => (
                    <li className="order-items__row" key={i.product.id}>
                      <span className="order-items__name">{i.product.name}</span>
                      <span className="order-items__qty">× {i.qty}</span>
                      <span className="order-items__sum">
                        {formatPrice(i.product.price * i.qty)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="form__field">
                <label className="checkbox">
                  <input
                    id="co-consent"
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                    aria-required="true"
                    aria-invalid={errors.consent ? 'true' : undefined}
                  />
                  <span className="checkbox__text">
                    Согласен на обработку персональных данных в соответствии с{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                      политикой конфиденциальности
                    </a>
                    .
                  </span>
                </label>
                {errors.consent && (
                  <span className="form__error" role="alert">
                    {errors.consent}
                  </span>
                )}
              </div>

              {sendError && (
                <p className="form__error form__error--block" role="alert">
                  {sendError}
                </p>
              )}

              <button className="btn btn--primary btn--block" type="submit" disabled={sending}>
                {sending ? 'Бронируем…' : 'Забронировать'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
