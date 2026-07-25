import { useEffect, useState } from 'react'
import { getAnnouncement, saveAnnouncement } from './admin-api.js'

const MSG_MAX = 300

export default function AnnouncementTab() {
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState('info')
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    getAnnouncement()
      .then((a) => {
        if (cancelled) return
        setMessage(a.message || '')
        setLevel(a.level === 'warn' ? 'warn' : 'info')
        setActive(Boolean(a.active))
      })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setErr('')
    setSaved(false)
    const trimmed = message.trim()
    if (active && !trimmed) {
      setErr('Нельзя показывать пустое объявление — введите текст.')
      return
    }
    setSaving(true)
    try {
      await saveAnnouncement({ active, message: trimmed, level })
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
        Баннер показывается всем посетителям вверху сайта — например, если магазин временно не
        работает или изменился режим. Выключите переключатель, чтобы убрать.
      </p>

      <label className="adm-field">
        <span className="adm-field__label">Текст объявления</span>
        <textarea
          className="adm-input"
          rows={3}
          maxLength={MSG_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Например: 31 декабря магазин работает до 15:00"
        />
        <span className="adm-field__counter">
          {message.length} / {MSG_MAX}
        </span>
      </label>

      <label className="adm-field">
        <span className="adm-field__label">Тип</span>
        <select className="adm-input" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="info">Обычное (информация)</option>
          <option value="warn">Важное (предупреждение)</option>
        </select>
      </label>

      <label className="adm-check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Показывать на сайте</span>
      </label>

      <div className="adm-ann__actions">
        <button className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
          Сохранить
        </button>
        {saved && <span className="adm-ok">✓ сохранено</span>}
      </div>

      {err && <p className="adm-err">{err}</p>}
    </section>
  )
}
