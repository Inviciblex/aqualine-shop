// Вынесено из admin.html в отдельный файл: строгая CSP (script-src 'self')
// блокирует инлайновые скрипты, поэтому логика админки должна грузиться
// как самостоятельный ресурс с того же домена.
const STATUS_LABELS = {
  new: 'Принят',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
}
const PAYMENT = { card: 'Картой при получении', cash: 'Наличными' }
const rub = (v) => new Intl.NumberFormat('ru-RU').format(v || 0) + ' ₽'
const esc = (s) =>
  (s == null ? '' : String(s)).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

let API = sessionStorage.getItem('adm_api') || '/api'
let TOKEN = sessionStorage.getItem('adm_token') || ''
let STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled']
// Сколько дней держим бронь до самовывоза. Держите в синхроне с HOLD_DAYS
// в src/store.js. Активные брони старше этого срока подсвечиваются как просроченные.
const HOLD_DAYS = 2

const $ = (id) => document.getElementById(id)

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

async function api(path, opts) {
  const res = await fetch(API.replace(/\/$/, '') + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': TOKEN, ...(opts && opts.headers) },
  })
  return res
}

async function loadOrders() {
  const res = await api('/admin/orders')
  if (res.status === 401) throw new Error('Неверный токен')
  if (res.status === 503) throw new Error('Админка выключена: задайте ADMIN_TOKEN на сервере')
  if (!res.ok) throw new Error('Ошибка ' + res.status)
  const data = await res.json()
  STATUSES = data.statuses || STATUSES
  return data.orders || []
}

function render(orders) {
  $('count').textContent = orders.length ? 'Всего заказов: ' + orders.length : ''
  if (!orders.length) {
    $('list').innerHTML = '<p class="muted">Заказов пока нет.</p>'
    return
  }
  $('list').innerHTML = orders
    .map((o) => {
      const opts = STATUSES.map(
        (s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_LABELS[s] || s}</option>`,
      ).join('')
      const items = (o.items || [])
        .map(
          (it) =>
            `<li><span>${esc(it.name)} <span class="muted mono">× ${it.qty}</span></span><span class="mono">${rub(it.price * it.qty)}</span></li>`,
        )
        .join('')
      // Завершённые заказы (выполнен/отменён) приглушаем — легче отличать активные.
      const dim = o.status === 'done' || o.status === 'cancelled' ? ' order--dim' : ''
      // Заказ сохранён, но уведомление в Telegram не доставлено (сервер пробует
      // досылать автоматически). Показываем, чтобы менеджер не пропустил бронь.
      const notNotified =
        o.notified === false
          ? '<span class="notif-warn" title="Уведомление в Telegram не доставлено — сервер пробует дослать">⚠ не уведомлён</span>'
          : ''
      // Активная бронь (принята/подтверждена) старше срока хранения — товар стоит
      // освободить или связаться с клиентом.
      const active = o.status === 'new' || o.status === 'confirmed'
      const ageDays = (Date.now() - new Date(o.createdAt).getTime()) / 86400000
      const overdue = active && ageDays > HOLD_DAYS
      const overdueCls = overdue ? ' order--overdue' : ''
      const overdueBadge = overdue
        ? `<span class="overdue-warn" title="Бронь старше ${HOLD_DAYS} дн. — срок хранения истёк">⏰ просрочена</span>`
        : ''
      return `<div class="order${dim}${overdueCls}" data-id="${esc(o.id)}">
          <div class="ohead">
            <div><div class="oid">${esc(o.id)} ${notNotified} ${overdueBadge}</div><div class="odate">${fmtDate(o.createdAt)}</div></div>
            <div class="statusctl">
              <select data-role="status">${opts}</select>
              <button data-role="save">Сохранить</button>
              <span class="saved" data-role="saved" style="display:none">✓</span>
            </div>
          </div>
          <div class="cust"><b>${esc(o.name)}</b> · ${esc(o.phone)} · ${esc(PAYMENT[o.payment] || o.payment)}
            ${o.comment ? '<br>Комментарий: ' + esc(o.comment) : ''}
          </div>
          <ul class="items">${items}</ul>
          <div class="ofoot"><span class="muted">Итого</span><span class="total">${rub(o.total)}</span></div>
        </div>`
    })
    .join('')

  // навешиваем сохранение
  document.querySelectorAll('.order').forEach((card) => {
    const id = card.getAttribute('data-id')
    const sel = card.querySelector('[data-role=status]')
    const btn = card.querySelector('[data-role=save]')
    const ok = card.querySelector('[data-role=saved]')
    btn.addEventListener('click', async () => {
      btn.disabled = true
      ok.style.display = 'none'
      try {
        const res = await api('/admin/order/' + encodeURIComponent(id) + '/status', {
          method: 'POST',
          body: JSON.stringify({ status: sel.value }),
        })
        if (!res.ok) throw new Error('Ошибка ' + res.status)
        ok.style.display = 'inline'
        setTimeout(() => (ok.style.display = 'none'), 1800)
      } catch (e) {
        alert('Не удалось сохранить: ' + e.message)
      } finally {
        btn.disabled = false
      }
    })
  })
}

let ALL = []

function applyFilters() {
  const q = ($('search').value || '').trim().toLowerCase()
  const st = $('statusFilter').value
  const filtered = ALL.filter((o) => {
    const okStatus = !st || o.status === st
    const hay = `${o.id} ${o.name || ''} ${o.phone || ''}`.toLowerCase()
    const okQ = !q || hay.includes(q)
    return okStatus && okQ
  })
  render(filtered)
  return filtered
}

function fillStatusOptions() {
  const sel = $('statusFilter')
  sel.innerHTML =
    '<option value="">Все статусы</option>' +
    STATUSES.map((s) => `<option value="${s}">${STATUS_LABELS[s] || s}</option>`).join('')
}

function toCSV(orders) {
  const cols = ['id', 'createdAt', 'status', 'name', 'phone', 'payment', 'comment', 'total', 'items']
  const escCsv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  const rows = orders.map((o) =>
    cols
      .map((c) => {
        if (c === 'items')
          return escCsv((o.items || []).map((it) => `${it.name} x${it.qty} = ${it.price * it.qty}`).join('; '))
        if (c === 'status') return escCsv(STATUS_LABELS[o.status] || o.status)
        return escCsv(o[c])
      })
      .join(','),
  )
  // BOM, чтобы Excel правильно открыл кириллицу в UTF-8
  return '﻿' + cols.join(',') + '\n' + rows.join('\n')
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function enter() {
  try {
    ALL = await loadOrders()
    fillStatusOptions()
    $('login').style.display = 'none'
    $('app').style.display = 'block'
    applyFilters()
  } catch (e) {
    $('loginErr').style.display = 'block'
    $('loginErr').textContent = e.message
    $('app').style.display = 'none'
    $('login').style.display = 'block'
  }
}

$('loginBtn').addEventListener('click', () => {
  API = $('api').value.trim() || '/api'
  TOKEN = $('token').value.trim()
  sessionStorage.setItem('adm_api', API)
  sessionStorage.setItem('adm_token', TOKEN)
  $('loginErr').style.display = 'none'
  enter()
})
$('refresh').addEventListener('click', async () => {
  try {
    ALL = await loadOrders()
    fillStatusOptions()
    applyFilters()
  } catch (e) {
    alert(e.message)
  }
})
$('search').addEventListener('input', applyFilters)
$('statusFilter').addEventListener('change', applyFilters)
$('export').addEventListener('click', () => {
  const data = applyFilters()
  if (!data.length) {
    alert('Нечего экспортировать')
    return
  }
  const stamp = new Date().toISOString().slice(0, 10)
  download(`zakazy-${stamp}.csv`, toCSV(data))
})
$('logout').addEventListener('click', () => {
  sessionStorage.removeItem('adm_token')
  TOKEN = ''
  $('app').style.display = 'none'
  $('login').style.display = 'block'
})

// автологин, если токен уже введён в этой сессии
$('api').value = API
if (TOKEN) {
  $('token').value = TOKEN
  enter()
}
