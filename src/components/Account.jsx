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

// ── Иконки плиток (наследуют currentColor) ──
const IconOrders = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
    <path
      d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path
      d="M9 12h6M9 16h6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
    <path
      d="M12 20s-6.8-4.3-9-8.2A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 9 5.8C18.8 15.7 12 20 12 20Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
)
const IconTool = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
    <path
      d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

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

// ── Данные профиля: просмотр списком + режим редактирования ──
function ProfileDetails() {
  const { user, updateProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setName(user.name || '')
    setPhone(user.phone || '')
  }, [user])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const res = await updateProfile({ name, phone })
    setBusy(false)
    if (res.ok) {
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } else {
      setErr(authErrorText(res.error))
    }
  }

  function cancel() {
    setEditing(false)
    setErr('')
    setName(user.name || '')
    setPhone(user.phone || '')
  }

  return (
    <section className="account__section">
      <div className="account__section-head">
        <h2 className="account__section-title">Данные профиля</h2>
        {!editing && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            Изменить
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <ul className="account__plist">
            <li>
              <span>Email</span>
              <strong>{user.email}</strong>
            </li>
            <li>
              <span>Имя</span>
              <strong>{user.name || '—'}</strong>
            </li>
            <li>
              <span>Телефон</span>
              <strong>{user.phone || '—'}</strong>
            </li>
          </ul>
          {saved && <p className="account__ok">✓ сохранено</p>}
        </>
      ) : (
        <form className="account__form account__form--flush" onSubmit={submit}>
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
          <div className="account__form-actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              Сохранить
            </button>
            <button className="btn btn--ghost" type="button" onClick={cancel}>
              Отмена
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

// ── Смена пароля (свёртка) ──
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
      setOpen(false)
      setTimeout(() => setDone(false), 2200)
    } else {
      setErr(authErrorText(res.error))
    }
  }

  return (
    <section className="account__section">
      <div className="account__section-head">
        <h2 className="account__section-title">Пароль</h2>
        {!open && (
          <button className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
            Сменить пароль
          </button>
        )}
      </div>
      {done && <p className="account__ok">✓ пароль обновлён</p>}
      {open && (
        <form className="account__form account__form--flush" onSubmit={submit}>
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
          <div className="account__form-actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              Обновить пароль
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}
    </section>
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

// Плитка быстрого перехода.
function Tile({ href, icon, label, hint, variant, external }) {
  return (
    <a
      className={`acc-tile${variant ? ` acc-tile--${variant}` : ''}`}
      href={href}
      // rel="external" — /admin грузится отдельным бандлом (см. main.jsx) и живёт
      // вне SPA-роутинга витрины; без этого перехватчик кликов роутера сделал бы
      // client-side переход на несуществующий во витрине маршрут → сброс на главную.
      rel={external ? 'external' : undefined}
    >
      <span className="acc-tile__icon">{icon}</span>
      <span className="acc-tile__text">
        <span className="acc-tile__label">{label}</span>
        <span className="acc-tile__hint">{hint}</span>
      </span>
      <span className="acc-tile__arrow" aria-hidden="true">
        →
      </span>
    </a>
  )
}

export default function Account({ onBack }) {
  const { user, admin, loading, logout } = useAuth()
  const avatar = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

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
          {/* Карточка-профиль: бирюзовый градиент, аватар-инициал, капля-водяной знак */}
          <section className="account__hero">
            <span className="account__hero-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <path
                  d="M16 3 C16 3 6 14 6 21 a10 10 0 0 0 20 0 C26 14 16 3 16 3 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </span>
            <span className="account__avatar">{avatar}</span>
            <div className="account__hero-id">
              <span className="account__hero-eyebrow">Личный кабинет</span>
              <p className="account__hero-name">{user.name || 'С возвращением'}</p>
              <span className="account__hero-email">{user.email}</span>
            </div>
          </section>

          <nav className="account__tiles" aria-label="Быстрые переходы">
            <Tile href="/orders" icon={<IconOrders />} label="Мои брони" hint="Статусы и история" />
            <Tile
              href="/favorites"
              icon={<IconHeart />}
              label="Избранное"
              hint="Сохранённые товары"
            />
            {admin && (
              <Tile
                href="/admin"
                icon={<IconTool />}
                label="Админка"
                hint="Управление магазином"
                variant="admin"
                external
              />
            )}
          </nav>

          <div className="account__card account__card--pad">
            <ProfileDetails />
            <PasswordForm />
          </div>

          <div className="account__card account__card--pad">
            <div className="account__section-head">
              <h2 className="account__section-title">История броней</h2>
            </div>
            <p className="account__muted account__cardhint">
              Брони, оформленные под этим аккаунтом. Видны с любого устройства.
            </p>
            <AccountOrders />
          </div>

          <div className="account__actions">
            <button className="btn btn--ghost" onClick={logout}>
              Выйти
            </button>
          </div>
        </>
      )}
    </main>
  )
}
