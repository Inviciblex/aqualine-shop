import { useCallback, useEffect, useState } from 'react'
import { setAuthLostHandler } from './admin-api.js'
import { apiMe, apiLogout } from '../auth-api.js'
import OrdersTab from './OrdersTab.jsx'
import ProductsTab from './ProductsTab.jsx'
import AnnouncementTab from './AnnouncementTab.jsx'
import './admin.css'

const TABS = [
  { key: 'orders', label: 'Брони' },
  { key: 'products', label: 'Товары' },
  { key: 'announcement', label: 'Объявление' },
]

// Доступ к /admin — только у админа (email в ADMIN_EMAILS). Не-админов не держим
// на служебной странице, а перенаправляем: гостя — на вход в кабинет (/account),
// вошедшего-без-прав — на главную (/). Вход происходит в кабинете, а не здесь.
export default function Admin() {
  const [state, setState] = useState('checking') // checking | admin | redirect
  const [tab, setTab] = useState('orders')

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

  // Проверяем доступ по сессии; не-админа сразу уводим (replace — без записи в
  // историю, чтобы «назад» не возвращало на /admin).
  const resolveAccess = useCallback((res) => {
    if (res.ok && res.admin) {
      setState('admin')
    } else {
      setState('redirect')
      window.location.replace(res.ok ? '/' : '/account')
    }
  }, [])

  useEffect(() => {
    let alive = true
    apiMe().then((res) => {
      if (alive) resolveAccess(res)
    })
    return () => {
      alive = false
    }
  }, [resolveAccess])

  // 401/403 на любом админ-запросе (кука истекла / сняли права) → на вход в кабинет.
  useEffect(() => {
    setAuthLostHandler(() => {
      setState('redirect')
      window.location.replace('/account')
    })
    return () => setAuthLostHandler(null)
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setState('redirect')
    window.location.replace('/account')
  }, [])

  if (state !== 'admin') {
    return (
      <main className="adm-login">
        <p className="adm-muted">
          {state === 'redirect' ? 'Перенаправление…' : 'Проверка доступа…'}
        </p>
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
          <a className="adm-btn adm-btn--ghost" href="/">
            На сайт
          </a>
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
