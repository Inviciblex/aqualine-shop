import { useEffect, useState } from 'react'
import { fetchAnnouncement } from '../announcement.js'

// Ключ закрытия: помним ВЕРСИЮ (id) закрытого объявления, а не факт закрытия.
// Сменил владелец текст → новый id → плашка показывается снова.
const DISMISS_KEY = 'aqualine_announce_dismissed_v1'

// Объявление магазина: тонкая плашка сверху для всех посетителей (напр. «магазин
// не работает такого-то числа»). Текст приходит с бэкенда; закрывается вручную.
export default function AnnouncementBanner() {
  const [ann, setAnn] = useState(null)

  useEffect(() => {
    let alive = true
    fetchAnnouncement().then((a) => {
      if (!alive || !a) return
      let dismissed = null
      try {
        dismissed = localStorage.getItem(DISMISS_KEY)
      } catch {
        // приватный режим / localStorage недоступен — просто покажем плашку
      }
      if (dismissed === a.id) return
      setAnn(a)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!ann) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, ann.id)
    } catch {
      // не смогли запомнить — не страшно, закроем хотя бы на эту сессию
    }
    setAnn(null)
  }

  return (
    <div className={`announce announce--${ann.level}`} role="status" aria-live="polite">
      <div className="announce__inner">
        <svg
          className="announce__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          width="18"
          height="18"
        >
          <path
            d="M12 4 a5 5 0 0 1 5 5 c0 4 1.5 5.5 2.5 6.5 H4.5 C5.5 14.5 7 13 7 9 a5 5 0 0 1 5-5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M10 19 a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <p className="announce__text">{ann.message}</p>
        <button
          type="button"
          className="announce__close"
          onClick={dismiss}
          aria-label="Скрыть объявление"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
