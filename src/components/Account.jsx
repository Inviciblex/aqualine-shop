import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiOrders, authErrorText } from '../auth-api.js'
import { STATUS_LABELS } from '../orders.js'
import { formatPrice } from '../utils.js'
import './Account.css'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

// Поле пароля с переключателем видимости.
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <label className="account__field" htmlFor={id}>
      <span className="account__label">{label}</span>
      <span className="account__pw">
        <input
          id={id}
          className="account__input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="account__pw-toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {show ? 'Скрыть' : 'Показать'}
        </button>
      </span>
    </label>
  )
}

// ── Гость: вход и регистрация (вкладки) ──
function AuthForms() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const res =
      mode === 'login'
        ? await login({ email, password })
        : await register({ email, password, name, phone })
    setBusy(false)
    if (!res.ok) setErr(authErrorText(res.error))
  }

  return (
    <section className="account__card">
      <div className="account__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'login'}
          className={`account__tab${mode === 'login' ? ' account__tab--active' : ''}`}
          onClick={() => {
            setMode('login')
            setErr('')
          }}
        >
          Вход
        </button>
        <button
          role="tab"
          aria-selected={mode === 'register'}
          className={`account__tab${mode === 'register' ? ' account__tab--active' : ''}`}
          onClick={() => {
            setMode('register')
            setErr('')
          }}
        >
          Регистрация
        </button>
      </div>

      <form className="account__form" onSubmit={submit}>
        <label className="account__field" htmlFor="acc-email">
          <span className="account__label">Электронная почта</span>
          <input
            id="acc-email"
            className="account__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <PasswordField
          id="acc-password"
          label="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        {mode === 'register' && (
          <>
            <label className="account__field" htmlFor="acc-name">
              <span className="account__label">Имя (необязательно)</span>
              <input
                id="acc-name"
                className="account__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="account__field" htmlFor="acc-phone">
              <span className="account__label">Телефон (необязательно)</span>
              <input
                id="acc-phone"
                className="account__input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </label>
          </>
        )}

        {err && (
          <p className="account__err" role="alert">
            {err}
          </p>
        )}

        <button className="btn btn--primary account__submit" type="submit" disabled={busy}>
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="account__hint">
        Аккаунт необязателен: бронировать можно и без входа. С аккаунтом история броней сохраняется
        и доступна с любого устройства.
      </p>
    </section>
  )
}

// ── Профиль (имя/телефон) ──
function ProfileForm() {
  const { user, updateProfile } = useAuth()
  const [name, setName] = useState(user.name || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setSaved(false)
    setBusy(true)
    const res = await updateProfile({ name, phone })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } else {
      setErr(authErrorText(res.error))
    }
  }

  return (
    <form className="account__form" onSubmit={submit}>
      <label className="account__field">
        <span className="account__label">Электронная почта</span>
        <input className="account__input" value={user.email} readOnly disabled />
      </label>
      <label className="account__field" htmlFor="prof-name">
        <span className="account__label">Имя</span>
        <input
          id="prof-name"
          className="account__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>
      <label className="account__field" htmlFor="prof-phone">
        <span className="account__label">Телефон</span>
        <input
          id="prof-phone"
          className="account__input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </label>
      {err && (
        <p className="account__err" role="alert">
          {err}
        </p>
      )}
      <div className="account__row">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          Сохранить
        </button>
        {saved && <span className="account__ok">✓ сохранено</span>}
      </div>
    </form>
  )
}

// ── Смена пароля ──
function PasswordForm() {
  const { changePassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setDone(false)
    setBusy(true)
    const res = await changePassword({ current, next })
    setBusy(false)
    if (res.ok) {
      setDone(true)
      setCurrent('')
      setNext('')
      setTimeout(() => setDone(false), 1800)
    } else {
      setErr(authErrorText(res.error))
    }
  }

  if (!open) {
    return (
      <button className="btn account__linkbtn" onClick={() => setOpen(true)}>
        Сменить пароль
      </button>
    )
  }

  return (
    <form className="account__form" onSubmit={submit}>
      <PasswordField
        id="pw-current"
        label="Текущий пароль"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
      />
      <PasswordField
        id="pw-next"
        label="Новый пароль (от 8 символов)"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
      />
      {err && (
        <p className="account__err" role="alert">
          {err}
        </p>
      )}
      <div className="account__row">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          Обновить пароль
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Отмена
        </button>
        {done && <span className="account__ok">✓ пароль обновлён</span>}
      </div>
    </form>
  )
}

// ── История броней аккаунта (с сервера) ──
function AccountOrders() {
  const [state, setState] = useState({ status: 'loading', orders: [] })

  useEffect(() => {
    let alive = true
    apiOrders().then((res) => {
      if (!alive) return
      if (res.ok) setState({ status: 'ready', orders: res.orders || [] })
      else setState({ status: 'error', orders: [] })
    })
    return () => {
      alive = false
    }
  }, [])

  if (state.status === 'loading') return <p className="account__muted">Загрузка истории…</p>
  if (state.status === 'error')
    return <p className="account__muted">Не удалось загрузить историю броней.</p>
  if (!state.orders.length)
    return <p className="account__muted">Броней по этому аккаунту пока нет.</p>

  return (
    <ul className="account__orders">
      {state.orders.map((o) => (
        <li key={o.id} className="account__order">
          <span className="account__order-id">{o.id}</span>
          <span className="account__muted">{formatDate(o.createdAt)}</span>
          <span className={`status status--${o.status}`}>
            {STATUS_LABELS[o.status] || o.status}
          </span>
          <span className="account__order-sum">{formatPrice(o.total)}</span>
        </li>
      ))}
    </ul>
  )
}

// Плитка быстрого перехода в кабинете.
function Tile({ href, icon, label, sub, variant }) {
  return (
    <a className={`account__tile${variant ? ` account__tile--${variant}` : ''}`} href={href}>
      <span className="account__tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="account__tile-body">
        <span className="account__tile-label">{label}</span>
        <span className="account__tile-sub">{sub}</span>
      </span>
      <span className="account__tile-arrow" aria-hidden="true">
        →
      </span>
    </a>
  )
}

export default function Account({ onBack }) {
  const { user, admin, loading, logout } = useAuth()

  return (
    <main className="account">
      <a className="back" href="/" onClick={onBack}>
        <span aria-hidden="true">←</span> В каталог
      </a>
      <h1 className="account__title">Личный кабинет</h1>

      {loading ? (
        <p className="account__muted">Загрузка…</p>
      ) : !user ? (
        <AuthForms />
      ) : (
        <>
          <section className="account__welcome">
            <div>
              <p className="account__hello">
                {user.name ? `Здравствуйте, ${user.name}` : 'Здравствуйте!'}
              </p>
              <p className="account__email">{user.email}</p>
            </div>
            <button className="btn account__logout" onClick={logout}>
              Выйти
            </button>
          </section>

          <nav className="account__tiles" aria-label="Быстрые переходы">
            <Tile href="/orders" icon="📦" label="Мои брони" sub="Статусы и история заказов" />
            <Tile href="/favorites" icon="❤️" label="Избранное" sub="Сохранённые товары" />
            {admin && (
              <Tile
                href="/admin"
                icon="🛠"
                label="Админка"
                sub="Управление магазином"
                variant="admin"
              />
            )}
          </nav>

          <div className="account__grid">
            <section className="account__card">
              <h2 className="account__subtitle">Профиль</h2>
              <ProfileForm />
              <div className="account__pwrow">
                <PasswordForm />
              </div>
            </section>

            <section className="account__card">
              <h2 className="account__subtitle">История броней</h2>
              <p className="account__muted account__cardhint">
                Брони, оформленные под этим аккаунтом. Видны с любого устройства.
              </p>
              <AccountOrders />
            </section>
          </div>
        </>
      )}
    </main>
  )
}
