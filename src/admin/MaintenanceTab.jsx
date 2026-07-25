import { useEffect, useState } from 'react'
import { getMaintenance, saveMaintenance } from './admin-api.js'

const MSG_MAX = 300

export default function MaintenanceTab() {
  const [on, setOn] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    getMaintenance()
      .then((m) => {
        if (!alive) return
        setOn(Boolean(m.on))
        setMessage(m.message || '')
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function save() {
    setErr('')
    setSaved(false)
    setSaving(true)
    try {
      await saveMaintenance({ on, message: message.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="adm-muted">Загрузка…</p>

  return (
    <section className="adm-card adm-ann">
      <p className="adm-muted adm-ann__hint">
        Когда режим включён, обычные посетители видят полноэкранную заглушку «Технические работы», а
        вы (администратор) продолжаете видеть сайт. Удобно на время обновления каталога или
        профилактики.
      </p>

      <label className="adm-check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>Включить режим техработ</span>
      </label>

      <label className="adm-field">
        <span className="adm-field__label">Сообщение для посетителей (необязательно)</span>
        <textarea
          className="adm-input"
          rows={3}
          maxLength={MSG_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Например: обновляем каталог, вернёмся через час"
        />
        <span className="adm-field__counter">
          {message.length} / {MSG_MAX} — пусто → покажем стандартный текст
        </span>
      </label>

      <div className="adm-ann__actions">
        <button className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
          Сохранить
        </button>
        {saved && <span className="adm-ok">✓ сохранено</span>}
        {on && <span className="adm-badge adm-badge--overdue">режим включён</span>}
      </div>

      {err && <p className="adm-err">{err}</p>}
    </section>
  )
}
