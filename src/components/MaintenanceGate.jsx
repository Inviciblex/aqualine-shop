import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchMaintenance } from '../maintenance.js'
import { STORE_PHONE, STORE_PHONE_HREF, STORE_EMAIL, STORE_EMAIL_HREF } from '../store.js'

// Режим техработ. Владелец включает его в админке. Обычные посетители видят
// полноэкранную заглушку (сайт закрыт), а администратор — сайт как обычно плюс
// плашку-напоминание сверху. Так можно спокойно чинить магазин, не теряя вход в
// админку. Проверка admin — по сессии (флаг из /api/auth/me).
const DEFAULT_MESSAGE =
  'На сайте идут технические работы — скоро всё заработает. Загляните чуть позже, пожалуйста.'

function MaintenanceScreen({ message }) {
  return (
    <main className="maint" role="main">
      <div className="maint__card">
        <span className="maint__eyebrow">Аквалин</span>
        <svg
          className="maint__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" />
        </svg>
        <h1 className="maint__title">Технические работы</h1>
        <p className="maint__text">{message || DEFAULT_MESSAGE}</p>
        <div className="maint__contacts">
          <span>Нужна помощь? Напишите или позвоните:</span>
          <a href={STORE_PHONE_HREF}>{STORE_PHONE}</a>
          <a href={STORE_EMAIL_HREF}>{STORE_EMAIL}</a>
        </div>
      </div>
    </main>
  )
}

export default function MaintenanceGate({ children }) {
  const { admin, loading } = useAuth()
  const [state, setState] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => fetchMaintenance().then((m) => alive && setState(m))
    load()
    // Периодически перепроверяем, чтобы заглушка сама ушла по завершении работ
    // (и появилась при включении) без перезагрузки страницы у посетителя.
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  // Пока не знаем состояние (или бэкенд недоступен) — показываем сайт как обычно.
  if (state?.on && !loading && !admin) {
    return <MaintenanceScreen message={state.message} />
  }

  return (
    <>
      {state?.on && admin && (
        <div className="maint__banner" role="status">
          Режим техработ включён — сайт виден только вам.{' '}
          <a href="/admin" rel="external">
            Выключить в админке
          </a>
          .
        </div>
      )}
      {children}
    </>
  )
}
