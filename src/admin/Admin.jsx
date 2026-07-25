import { useCallback, useEffect, useState } from 'react'
import { setAuthLostHandler } from './admin-api.js'
import { apiMe, apiLogout } from '../auth-api.js'
import OrdersTab from './OrdersTab.jsx'
import ProductsTab from './ProductsTab.jsx'
import AnnouncementTab from './AnnouncementTab.jsx'
import MaintenanceTab from './MaintenanceTab.jsx'
import './admin.css'

const TABS = [
  { key: 'orders', label: 'Брони' },
  { key: 'products', label: 'Товары' },
  { key: 'announcement', label: 'Объявление' },
  { key: 'maintenance', label: 'Техработы' },
]

// Доступ к /admin — только у админа (email в ADMIN_EMAILS). Гостя отправляем на
// вход в кабинет (/account). Вошедшего-без-прав НЕ уводим молча на главную (это
// сбивало с толку — «админка просто кидает на сайт»), а показываем понятный
// экран: под каким аккаунтом вошли и как сменить его на админский.
export default function Admin() {
  const [state, setState] = useState('checking') // checking | admin | denied | redirect
  const [email, setEmail] = useState('')
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

  // Проверяем доступ по сессии. Админ → внутрь. Вошёл, но не админ → экран
  // «нет прав» (с почтой текущего аккаунта). Гость → на вход в кабинет
  // (replace — без записи в историю, чтобы «назад» не возвращало на /admin).
  const resolveAccess = useCallback((res) => {
    if (res.ok && res.admin) {
      setState('admin')
    } else if (res.ok) {
      setEmail(res.user?.email || '')
      setState('denied')
    } else {
      setState('redirect')
      window.location.replace('/account')
    }
  }, [])

  // Выйти из неадминского аккаунта и уйти на вход — чтобы войти под админским.
  const switchAccount = async () => {
    await apiLogout()
    window.location.replace('/account')
  }

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

  if (state === 'denied') {
    return (
      <main className="adm-login">
        <div className="adm-denied">
          <h1 className="adm-denied__title">Нет прав администратора</h1>
          <p className="adm-muted">
            Вы вошли как{email ? ' ' : ' гость'}
            {email && <strong>{email}</strong>}. У этого аккаунта нет доступа к админке. Войдите под
            аккаунтом администратора.
          </p>
          <div className="adm-denied__actions">
            <button className="adm-btn" onClick={switchAccount}>
              Войти под другим аккаунтом
            </button>
            <a className="adm-btn adm-btn--ghost" href="/" rel="external">
              На сайт
            </a>
          </div>
        </div>
      </main>
    )
  }

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
          {/* rel="external" — обойти SPA-перехватчик кликов роутера витрины
              (он загружается в бандл и иначе превратил бы переход в no-op). */}
          <a className="adm-btn adm-btn--ghost" href="/" rel="external">
            На сайт
          </a>
        </div>
      </header>

      <main className="adm-main">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'announcement' && <AnnouncementTab />}
        {tab === 'maintenance' && <MaintenanceTab />}
      </main>
    </div>
  )
}
