import { useCallback, useEffect, useState } from 'react'
import {
  getAuth,
  setAuth,
  clearToken,
  defaultApi,
  setAuthLostHandler,
  adminOrders,
} from './admin-api.js'
import OrdersTab from './OrdersTab.jsx'
import ProductsTab from './ProductsTab.jsx'
import AnnouncementTab from './AnnouncementTab.jsx'
import './admin.css'

const TABS = [
  { key: 'orders', label: 'Брони' },
  { key: 'products', label: 'Товары' },
  { key: 'announcement', label: 'Объявление' },
]

export default function Admin() {
  const initial = getAuth()
  const [authed, setAuthed] = useState(false)
  const [apiField, setApiField] = useState(initial.api || defaultApi())
  const [tokenField, setTokenField] = useState(initial.token || '')
  const [checking, setChecking] = useState(Boolean(initial.token))
  const [tab, setTab] = useState('orders')
  const [err, setErr] = useState('')

  // Админка — служебная страница: не индексируем и даём понятный заголовок.
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Админка — Аквалин'
    let meta = document.querySelector('meta[name="robots"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      document.head.appendChild(meta)
    }
    const prevRobots = meta.getAttribute('content')
    meta.setAttribute('content', 'noindex, nofollow')
    return () => {
      document.title = prevTitle
      if (created) meta.remove()
      else if (prevRobots != null) meta.setAttribute('content', prevRobots)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setAuthed(false)
    setTokenField('')
  }, [])

  // 401 на любом запросе (истёкший/сброшенный токен) → назад ко входу.
  useEffect(() => {
    setAuthLostHandler(() => {
      clearToken()
      setAuthed(false)
      setErr('Сессия недействительна — войдите снова.')
    })
    return () => setAuthLostHandler(null)
  }, [])

  // Проверка токена: пробуем загрузить брони. Успех → внутрь, иначе — на вход.
  const verify = useCallback(async () => {
    setErr('')
    setChecking(true)
    try {
      await adminOrders()
      setAuthed(true)
    } catch (e) {
      setAuthed(false)
      setErr(e.message)
    } finally {
      setChecking(false)
    }
  }, [])

  // Автовход, если токен уже введён в этой сессии вкладки.
  useEffect(() => {
    if (initial.token) verify()
    // один раз при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(e) {
    e.preventDefault()
    setAuth(apiField, tokenField)
    verify()
  }

  if (!authed) {
    return (
      <main className="adm-login">
        <form className="adm-card adm-login__card" onSubmit={submit}>
          <h1 className="adm-login__title">Аквалин — админка</h1>
          <p className="adm-muted">Вход по токену (заголовок X-Admin-Token).</p>

          <label className="adm-field">
            <span className="adm-field__label">Адрес API</span>
            <input
              className="adm-input"
              value={apiField}
              onChange={(e) => setApiField(e.target.value)}
              placeholder="/api"
              autoComplete="off"
            />
          </label>
          <label className="adm-field">
            <span className="adm-field__label">Админ-токен</span>
            <input
              className="adm-input"
              type="password"
              value={tokenField}
              onChange={(e) => setTokenField(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>

          {err && <p className="adm-err">{err}</p>}

          <button className="adm-btn adm-btn--primary" type="submit" disabled={checking}>
            {checking ? 'Проверка…' : 'Войти'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <div className="adm">
      <header className="adm-header">
        <div className="adm-header__inner">
          <span className="adm-header__brand">Аквалин · админка</span>
          <nav className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`adm-tab${tab === t.key ? ' adm-tab--active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="adm-btn adm-btn--ghost" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <main className="adm-main">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'announcement' && <AnnouncementTab />}
      </main>
    </div>
  )
}
