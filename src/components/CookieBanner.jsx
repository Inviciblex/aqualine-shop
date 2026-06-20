import { useState } from 'react'

// Уведомление об обработке cookie/ПДн (152-ФЗ). Показывается один раз —
// согласие запоминается в localStorage.
const KEY = 'aqualine_cookie_consent_v1'

function isDismissed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export default function CookieBanner() {
  const [show, setShow] = useState(() => !isDismissed())
  if (!show) return null

  const accept = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // приватный режим — баннер просто закроется на эту сессию
    }
    setShow(false)
  }

  return (
    <div className="cookie" role="region" aria-label="Уведомление об обработке данных">
      <p className="cookie__text">
        Мы используем cookie и обрабатываем персональные данные для работы сайта.
        Продолжая пользоваться сайтом, вы соглашаетесь с этим — подробнее в{' '}
        <a href="#/privacy">политике конфиденциальности</a>.
      </p>
      <button className="btn btn--primary cookie__btn" onClick={accept}>
        Понятно
      </button>
    </div>
  )
}
