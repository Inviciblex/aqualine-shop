// Клиент личного кабинета: тонкие обёртки над fetch к бэкенду /api/auth/*.
// Сессия — httpOnly-cookie, поэтому токены нигде не читаются и не хранятся;
// браузер сам шлёт куку при same-origin запросах (credentials: 'same-origin').
// Базовый путь выводим из VITE_ORDER_API_URL (/api/order → /api), как в
// catalog.js/admin-api.js, чтобы не заводить отдельную переменную сборки.
const ORDER_API_URL = import.meta.env.VITE_ORDER_API_URL
const BASE = ORDER_API_URL ? ORDER_API_URL.replace(/\/order\/?$/, '') || '/api' : '/api'

// Общий помощник: возвращает разобранный JSON. Любой сбой (нет сети, тело не
// JSON) → единый ответ { ok: false, error: 'network' }, чтобы UI не падал.
async function request(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({ ok: false, error: 'bad-response' }))
    return data
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function apiRegister(data) {
  return request('/auth/register', { method: 'POST', body: data })
}
export function apiLogin(data) {
  return request('/auth/login', { method: 'POST', body: data })
}
export function apiLogout() {
  return request('/auth/logout', { method: 'POST' })
}
export function apiMe() {
  return request('/auth/me')
}
export function apiUpdateProfile(data) {
  return request('/auth/profile', { method: 'POST', body: data })
}
export function apiChangePassword(data) {
  return request('/auth/password', { method: 'POST', body: data })
}
export function apiOrders() {
  return request('/orders')
}

// Человекочитаемый текст по коду ошибки бэкенда (для форм кабинета).
export const AUTH_ERRORS = {
  'bad-email': 'Проверьте адрес электронной почты',
  'bad-password': 'Пароль должен быть не короче 8 символов',
  'email-taken': 'Эта почта уже зарегистрирована — войдите',
  'bad-credentials': 'Неверная почта или пароль',
  'bad-current': 'Текущий пароль указан неверно',
  'too-many-attempts': 'Слишком много попыток — попробуйте позже',
  'rate-limited': 'Слишком много запросов — подождите немного',
  unauthorized: 'Войдите, чтобы продолжить',
  network: 'Нет связи с сервером',
  'bad-response': 'Сервер ответил некорректно',
}
export function authErrorText(error) {
  return AUTH_ERRORS[error] || 'Что-то пошло не так, попробуйте ещё раз'
}
