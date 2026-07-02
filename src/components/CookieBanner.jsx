import { useEffect, useState } from 'react'

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

// suppressed: временно скрыть баннер, пока открыт нижний CTA (шторка корзины,
// модалка оформления) — иначе фиксированный снизу баннер перекрывает их кнопки.
// Компонент остаётся смонтированным, поэтому согласие/состояние не теряется: как
// только оверлей закроется, баннер снова покажется (если ещё не приняли).
export default function CookieBanner({ suppressed = false }) {
  const [show, setShow] = useState(() => !isDismissed())
  const visible = show && !suppressed

  // Пока баннер виден, помечаем body — по этому классу CSS прячет мобильную
  // липкую панель покупки (.buybar), которую баннер иначе перекрывает снизу.
  useEffect(() => {
    document.body.classList.toggle('cookie-visible', visible)
    return () => document.body.classList.remove('cookie-visible')
  }, [visible])

  if (!visible) return null

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
        Мы используем cookie и обрабатываем персональные данные для работы сайта. Продолжая
        пользоваться сайтом, вы соглашаетесь с этим — подробнее в{' '}
        <a href="/privacy">политике конфиденциальности</a>.
      </p>
      <button className="btn btn--primary cookie__btn" onClick={accept}>
        Понятно
      </button>
    </div>
  )
}
