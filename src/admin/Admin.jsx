import { useCallback, useEffect, useState } from 'react'
import { setAuthLostHandler } from './admin-api.js'
import { apiMe, apiLogin, apiLogout, authErrorText } from '../auth-api.js'
import OrdersTab from './OrdersTab.jsx'
import ProductsTab from './ProductsTab.jsx'
import AnnouncementTab from './AnnouncementTab.jsx'
import './admin.css'

const TABS = [
  { key: 'orders', label: 'Брони' },
  { key: 'products', label: 'Товары' },
  { key: 'announcement', label: 'Объявление' },
]

// Состояния доступа: проверяем сессию → гость (форма входа) / вошёл-без-прав /
// админ. Права даёт email в белом списке ADMIN_EMAILS на сервере.
export default function Admin() {
  const [state, setState] = useState('checking') // checking | guest | denied | admin
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
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

  // 401/403 на любом админ-запросе (кука истекла / сняли права) → назад ко входу.
  useEffect(() => {
    setAuthLostHandler(() => {
      setState('guest')
      setErr('Сессия недействительна — войдите снова.')
    })
    return () => setAuthLostHandler(null)
  }, [])

  // Восстановление входа по существующей сессии: /me отдаёт флаг admin.
  useEffect(() => {
    let alive = true
    apiMe().then((res) => {
      if (!alive) return
      if (res.ok && res.admin) setState('admin')
      else if (res.ok) setState('denied')
      else setState('guest')
    })
    return () => {
      alive = false
    }
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setState('guest')
    setEmail('')
    setPassword('')
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const res = await apiLogin({ email, password })
    setBusy(false)
    if (!res.ok) {
      setErr(authErrorText(res.error))
      return
    }
    if (res.admin) setState('admin')
    else setState('denied')
  }

  if (state === 'checking') {
    return (
      <main className="adm-login">
        <p className="adm-muted">Проверка доступа…</p>
      </main>
    )
  }

  if (state !== 'admin') {
    return (
      <main className="adm-login">
        <form className="adm-card adm-login__card" onSubmit={submit}>
          <h1 className="adm-login__title">Аквалин — админка</h1>
          <p className="adm-muted">Вход по аккаунту администратора (email и пароль).</p>

          {state === 'denied' && (
            <p className="adm-err">
              У этого аккаунта нет прав администратора. Войдите под учёткой из списка
              администраторов или{' '}
              <button type="button" className="adm-linkbtn" onClick={logout}>
                выйти
              </button>
              .
            </p>
          )}

          {state !== 'denied' && (
            <>
              <label className="adm-field">
                <span className="adm-field__label">Электронная почта</span>
                <input
                  className="adm-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              <label className="adm-field">
                <span className="adm-field__label">Пароль</span>
                <input
                  className="adm-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              {err && <p className="adm-err">{err}</p>}

              <button className="adm-btn adm-btn--primary" type="submit" disabled={busy}>
                {busy ? 'Вход…' : 'Войти'}
              </button>
              <p className="adm-muted adm-login__hint">
                Нет аккаунта? Зарегистрируйтесь на сайте в разделе «Кабинет» тем email, который
                добавлен в список администраторов.
              </p>
            </>
          )}
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
