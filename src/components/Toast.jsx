import { useEffect, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'

export default function Toast() {
  const { notice, openCart } = useCart()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!notice) return
    setVisible(true)
    // Чуть дольше обычного — чтобы успеть нажать «Перейти» (особенно на телефоне).
    const t = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(t)
  }, [notice])

  if (!notice) return null

  return (
    <div className={`toast ${visible ? 'toast--show' : ''}`} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 12 l3 3 l5 -6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="toast__text">{notice.text}</span>
      <button
        type="button"
        className="toast__action"
        onClick={() => {
          setVisible(false)
          openCart()
        }}
      >
        В корзину
      </button>
    </div>
  )
}
