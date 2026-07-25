import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImage,
  deleteImage,
  reorderImages,
} from './admin-api.js'

const rub = (v) => new Intl.NumberFormat('ru-RU').format(v || 0) + ' ₽'
const MAX_IMAGES = 12

// Пустой товар для формы создания.
function blankProduct() {
  return {
    id: null,
    sku: '',
    name: '',
    category: '',
    brand: '',
    price: '',
    oldPrice: '',
    description: '',
    images: [],
    specs: [],
    related: [],
    inStock: true,
    clearance: false,
  }
}

// Товар с сервера → форма (числа в строки для полей ввода).
function toForm(p) {
  return {
    id: p.id,
    sku: p.sku || '',
    name: p.name || '',
    category: p.category || '',
    brand: p.brand || '',
    price: p.price != null ? String(p.price) : '',
    oldPrice: p.oldPrice ? String(p.oldPrice) : '',
    description: p.description || '',
    images: Array.isArray(p.images) ? p.images : [],
    specs: Array.isArray(p.specs) ? p.specs : [],
    related: Array.isArray(p.related) ? p.related : [],
    inStock: p.inStock !== false,
    clearance: Boolean(p.clearance),
  }
}

// Форма → payload для API (числа обратно, characteristics/related чистим).
function toPayload(form) {
  return {
    ...(form.id ? { id: form.id } : {}),
    sku: form.sku.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    brand: form.brand.trim(),
    price: Number(form.price) || 0,
    oldPrice: Number(form.oldPrice) || 0,
    description: form.description,
    images: form.images,
    specs: form.specs.filter((s) => s.label.trim()),
    related: form.related,
    inStock: form.inStock,
    clearance: form.clearance,
  }
}

function ProductForm({ initial, allProducts, onSaved, onDeleted, onCancel }) {
  const [form, setForm] = useState(initial)
  const [relatedInput, setRelatedInput] = useState((initial.related || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [imgBusy, setImgBusy] = useState(false)

  useEffect(() => {
    setForm(initial)
    setRelatedInput((initial.related || []).join(', '))
    setErr('')
  }, [initial])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const isEdit = Boolean(form.id)

  const nameById = useMemo(() => {
    const m = new Map()
    for (const p of allProducts) m.set(p.id, p.name)
    return m
  }, [allProducts])

  function commitRelated(text) {
    const ids = text
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
    set({ related: [...new Set(ids)] })
  }

  // Характеристики
  const addSpec = () => set({ specs: [...form.specs, { label: '', value: '' }] })
  const setSpec = (i, patch) =>
    set({ specs: form.specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  const removeSpec = (i) => set({ specs: form.specs.filter((_, idx) => idx !== i) })

  async function save() {
    setErr('')
    if (!form.name.trim()) {
      setErr('Укажите название товара')
      return
    }
    setSaving(true)
    try {
      const payload = toPayload({ ...form, related: form.related })
      const data = isEdit ? await updateProduct(payload) : await createProduct(payload)
      // После создания переключаемся в режим редактирования нового товара —
      // чтобы сразу можно было загрузить фото (нужен id).
      onSaved(data.product, !isEdit)
      if (!isEdit) setForm(toForm(data.product))
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!isEdit) return
    if (!window.confirm(`Удалить товар «${form.name}»? Это действие необратимо.`)) return
    setSaving(true)
    setErr('')
    try {
      await deleteProduct(form.id)
      onDeleted(form.id)
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  // ── Фото ──
  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // позволяем повторно выбрать тот же файл
    if (!files.length || !isEdit) return
    setImgBusy(true)
    setErr('')
    try {
      let images = form.images
      for (const file of files) {
        if (images.length >= MAX_IMAGES) {
          setErr('Достигнут лимит фотографий (12)')
          break
        }
        const data = await uploadImage(form.id, file)
        images = data.images
        set({ images })
      }
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setImgBusy(false)
    }
  }

  async function removeImage(url) {
    setImgBusy(true)
    setErr('')
    try {
      const data = await deleteImage(form.id, url)
      set({ images: data.images })
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setImgBusy(false)
    }
  }

  async function moveImage(i, dir) {
    const next = [...form.images]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    // Оптимистично показываем новый порядок, затем подтверждаем на сервере.
    set({ images: next })
    setImgBusy(true)
    setErr('')
    try {
      const data = await reorderImages(form.id, next)
      set({ images: data.images })
    } catch (e2) {
      setErr(e2.message)
      set({ images: form.images })
    } finally {
      setImgBusy(false)
    }
  }

  return (
    <div className="adm-card adm-form">
      <div className="adm-form__head">
        <h2>{isEdit ? `Товар #${form.id}` : 'Новый товар'}</h2>
        <button className="adm-btn adm-btn--ghost" onClick={onCancel}>
          ← К списку
        </button>
      </div>

      <div className="adm-form__grid">
        <label className="adm-field adm-field--wide">
          <span className="adm-field__label">Название *</span>
          <input
            className="adm-input"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">Артикул (SKU)</span>
          <input
            className="adm-input"
            value={form.sku}
            onChange={(e) => set({ sku: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">Категория</span>
          <input
            className="adm-input"
            list="adm-categories"
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">Бренд</span>
          <input
            className="adm-input"
            value={form.brand}
            onChange={(e) => set({ brand: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">Цена, ₽</span>
          <input
            className="adm-input"
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">Старая цена, ₽ (0 — нет)</span>
          <input
            className="adm-input"
            type="number"
            min="0"
            value={form.oldPrice}
            onChange={(e) => set({ oldPrice: e.target.value })}
          />
        </label>
      </div>

      <label className="adm-field adm-field--wide">
        <span className="adm-field__label">Описание</span>
        <textarea
          className="adm-input"
          rows={4}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>

      <div className="adm-form__checks">
        <label className="adm-check">
          <input
            type="checkbox"
            checked={form.inStock}
            onChange={(e) => set({ inStock: e.target.checked })}
          />
          <span>В наличии</span>
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={form.clearance}
            onChange={(e) => set({ clearance: e.target.checked })}
          />
          <span>Уценка</span>
        </label>
      </div>

      {/* Характеристики */}
      <fieldset className="adm-fieldset">
        <legend>Характеристики</legend>
        {form.specs.map((s, i) => (
          <div key={i} className="adm-spec-row">
            <input
              className="adm-input"
              placeholder="Название (напр. Материал)"
              value={s.label}
              onChange={(e) => setSpec(i, { label: e.target.value })}
            />
            <input
              className="adm-input"
              placeholder="Значение (напр. Латунь)"
              value={s.value}
              onChange={(e) => setSpec(i, { value: e.target.value })}
            />
            <button
              className="adm-btn adm-btn--ghost"
              onClick={() => removeSpec(i)}
              title="Удалить"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="adm-btn adm-btn--ghost" onClick={addSpec}>
          + Характеристика
        </button>
      </fieldset>

      {/* Похожие товары */}
      <label className="adm-field adm-field--wide">
        <span className="adm-field__label">Похожие товары — ID через запятую</span>
        <input
          className="adm-input"
          value={relatedInput}
          onChange={(e) => setRelatedInput(e.target.value)}
          onBlur={(e) => commitRelated(e.target.value)}
          placeholder="напр. 2, 5, 7"
        />
        {form.related.length > 0 && (
          <span className="adm-field__counter">
            {form.related.map((id) => nameById.get(id) || `#${id}`).join(' · ')}
          </span>
        )}
      </label>

      {/* Фото */}
      <fieldset className="adm-fieldset">
        <legend>Фотографии</legend>
        {!isEdit ? (
          <p className="adm-muted">Сохраните товар, чтобы загрузить фото.</p>
        ) : (
          <>
            <div className="adm-images">
              {form.images.map((url, i) => (
                <div key={url} className="adm-image">
                  <img src={url} alt="" loading="lazy" />
                  {i === 0 && <span className="adm-image__main">главная</span>}
                  <div className="adm-image__ctl">
                    <button
                      className="adm-btn adm-btn--ghost"
                      onClick={() => moveImage(i, -1)}
                      disabled={imgBusy || i === 0}
                      title="Левее"
                    >
                      ←
                    </button>
                    <button
                      className="adm-btn adm-btn--ghost"
                      onClick={() => moveImage(i, 1)}
                      disabled={imgBusy || i === form.images.length - 1}
                      title="Правее"
                    >
                      →
                    </button>
                    <button
                      className="adm-btn adm-btn--ghost"
                      onClick={() => removeImage(url)}
                      disabled={imgBusy}
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {form.images.length < MAX_IMAGES && (
              <label className="adm-btn adm-btn--ghost adm-upload">
                {imgBusy ? 'Загрузка…' : '+ Загрузить фото'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  hidden
                  disabled={imgBusy}
                  onChange={onUpload}
                />
              </label>
            )}
            <p className="adm-muted adm-images__hint">
              Первое фото — главное (показывается в каталоге и корзине). Порядок меняйте стрелками.
            </p>
          </>
        )}
      </fieldset>

      {err && <p className="adm-err">{err}</p>}

      <div className="adm-form__actions">
        <button className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
          {isEdit ? 'Сохранить изменения' : 'Создать товар'}
        </button>
        {isEdit && (
          <button className="adm-btn adm-btn--danger" onClick={remove} disabled={saving}>
            Удалить
          </button>
        )}
      </div>
    </div>
  )
}

export default function ProductsTab() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // объект формы или null (список)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const data = await adminProducts()
      setProducts(data.products || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [products],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return products
    return products.filter((p) =>
      `${p.id} ${p.name || ''} ${p.sku || ''} ${p.brand || ''} ${p.category || ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [products, q])

  function onSaved(product, created) {
    setProducts((list) => {
      const exists = list.some((p) => p.id === product.id)
      return exists ? list.map((p) => (p.id === product.id ? product : p)) : [...list, product]
    })
    if (created) setEditing(toForm(product))
  }
  function onDeleted(id) {
    setProducts((list) => list.filter((p) => p.id !== id))
    setEditing(null)
  }

  if (editing) {
    return (
      <>
        <datalist id="adm-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <ProductForm
          initial={editing}
          allProducts={products}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onCancel={() => setEditing(null)}
        />
      </>
    )
  }

  return (
    <section>
      <div className="adm-toolbar">
        <input
          className="adm-input"
          type="search"
          placeholder="Поиск по названию, артикулу, бренду"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="adm-btn adm-btn--ghost" onClick={load} disabled={loading}>
          Обновить
        </button>
        <button className="adm-btn adm-btn--primary" onClick={() => setEditing(blankProduct())}>
          + Добавить товар
        </button>
        <span className="adm-muted adm-toolbar__count">
          {products.length ? `Всего: ${products.length}` : ''}
        </span>
      </div>

      {err && <p className="adm-err">{err}</p>}
      {loading ? (
        <p className="adm-muted">Загрузка…</p>
      ) : !filtered.length ? (
        <p className="adm-muted">Товары не найдены.</p>
      ) : (
        <ul className="adm-plist">
          {filtered.map((p) => (
            <li key={p.id}>
              <button className="adm-prow" onClick={() => setEditing(toForm(p))}>
                <span className="adm-prow__thumb">
                  {p.images && p.images[0] ? (
                    <img src={p.images[0]} alt="" loading="lazy" />
                  ) : (
                    <span className="adm-prow__noimg">нет фото</span>
                  )}
                </span>
                <span className="adm-prow__main">
                  <span className="adm-prow__name">{p.name}</span>
                  <span className="adm-muted adm-prow__meta">
                    #{p.id}
                    {p.sku ? ` · ${p.sku}` : ''}
                    {p.category ? ` · ${p.category}` : ''}
                    {p.brand ? ` · ${p.brand}` : ''}
                  </span>
                </span>
                <span className="adm-prow__right">
                  <span className="adm-mono">{rub(p.price)}</span>
                  {!p.inStock && <span className="adm-badge">под заказ</span>}
                  {p.clearance && <span className="adm-badge adm-badge--sale">уценка</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
