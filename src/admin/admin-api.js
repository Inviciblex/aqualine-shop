// Клиент React-админки: обёртки над защищёнными эндпоинтами /api/admin/*.
// Авторизация — заголовок X-Admin-Token (тот же ADMIN_TOKEN, что проверяет
// сервер), НЕ cookie/аккаунты: админка не заводит новых персональных данных.
// Токен и адрес API живут в sessionStorage (стираются при закрытии вкладки).

// Базовый путь API. Выводим из VITE_ORDER_API_URL (/api/order → /api), чтобы не
// плодить переменные сборки; без него — относительный /api (работает за nginx).
const ORDER_API_URL = import.meta.env.VITE_ORDER_API_URL
const DEFAULT_API = ORDER_API_URL ? ORDER_API_URL.replace(/\/order\/?$/, '') || '/api' : '/api'

let API = sessionStorage.getItem('adm_api') || DEFAULT_API
let TOKEN = sessionStorage.getItem('adm_token') || ''

// Обработчик «сессия потеряна»: при 401 на любом запросе (сброшен/неверный токен)
// корневой Admin возвращает пользователя ко входу, а не показывает пустой экран.
let onAuthLost = null
export function setAuthLostHandler(fn) {
  onAuthLost = fn
}

export function getAuth() {
  return { api: API, token: TOKEN }
}
export function defaultApi() {
  return DEFAULT_API
}
export function setAuth(api, token) {
  API = (api || DEFAULT_API).trim() || DEFAULT_API
  TOKEN = (token || '').trim()
  sessionStorage.setItem('adm_api', API)
  sessionStorage.setItem('adm_token', TOKEN)
}
export function clearToken() {
  TOKEN = ''
  sessionStorage.removeItem('adm_token')
}

// Человекочитаемые сообщения по коду/ошибке — чтобы в UI не светить «HTTP 500».
const ERROR_TEXT = {
  'bad-name': 'Укажите название товара',
  'bad-price': 'Некорректная цена',
  'bad-id': 'Некорректный идентификатор',
  'bad-order': 'Неверный порядок фото',
  'bad-image': 'Файл не распознан как изображение (JPG, PNG, WebP, GIF)',
  'too-many-images': 'Достигнут лимит фотографий (12)',
  'too-long': 'Слишком длинный текст (макс. 300)',
  'empty-message': 'Нельзя показывать пустое объявление — введите текст',
  empty: 'Пустой файл',
}
function messageFor(status, body) {
  if (status === 401) return 'Неверный токен'
  if (status === 503) return 'Админка выключена: задайте ADMIN_TOKEN на сервере'
  if (status === 429) return 'Слишком много запросов — подождите немного'
  if (body && body.error && ERROR_TEXT[body.error]) return ERROR_TEXT[body.error]
  return `Ошибка ${status}`
}

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(API.replace(/\/$/, '') + path, {
      method,
      headers: {
        'X-Admin-Token': TOKEN,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Нет связи с сервером')
  }
  if (res.status === 401 && onAuthLost) onAuthLost()
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) throw new Error(messageFor(res.status, data))
  return data
}

// ── Заказы (брони) ──
export function adminOrders() {
  return request('/admin/orders')
}
export function setOrderStatus(id, status) {
  return request(`/admin/order/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: { status },
  })
}
export function extendOrder(id, days) {
  return request(`/admin/order/${encodeURIComponent(id)}/extend`, {
    method: 'POST',
    body: { days },
  })
}

// ── Товары ──
export function adminProducts() {
  return request('/admin/products')
}
export function createProduct(product) {
  return request('/admin/product/create', { method: 'POST', body: product })
}
export function updateProduct(product) {
  return request('/admin/product/update', { method: 'POST', body: product })
}
export function deleteProduct(id) {
  return request('/admin/product/delete', { method: 'POST', body: { id } })
}
export function deleteImage(id, url) {
  return request('/admin/product/image/delete', { method: 'POST', body: { id, url } })
}
export function reorderImages(id, images) {
  return request('/admin/product/image/reorder', { method: 'POST', body: { id, images } })
}

// Загрузка фото: сырые байты файла в теле (без multipart). Тип и имя определяет
// сервер по сигнатуре файла. Возвращает { ok, url, images }.
export async function uploadImage(id, file) {
  let res
  try {
    res = await fetch(
      `${API.replace(/\/$/, '')}/admin/product/image?id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: {
          'X-Admin-Token': TOKEN,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      },
    )
  } catch {
    throw new Error('Нет связи с сервером')
  }
  if (res.status === 401 && onAuthLost) onAuthLost()
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) throw new Error(messageFor(res.status, data))
  return data
}

// ── Объявление-баннер ──
export function getAnnouncement() {
  return request('/admin/announcement')
}
export function saveAnnouncement({ active, message, level }) {
  return request('/admin/announcement', { method: 'POST', body: { active, message, level } })
}
