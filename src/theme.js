// Тема оформления. Системная тёмная подхватывается через CSS
// (prefers-color-scheme) — без вспышки и без JS. Явный выбор пользователя
// хранится в localStorage и задаётся атрибутом data-theme на <html>.
const KEY = 'aqualine_theme'

export const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false

export function getStored() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

// Применяет явный выбор пользователя (если он был сделан). Системные
// пользователи остаются без data-theme — тему решает CSS-медиазапрос.
export function initTheme() {
  const s = getStored()
  if (s === 'light' || s === 'dark') document.documentElement.dataset.theme = s
}

export function storeTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // приватный режим — тема не сохранится между визитами
  }
}

// Текущая «эффективная» тема: явный выбор либо системная.
export function effectiveTheme() {
  return getStored() || (prefersDark() ? 'dark' : 'light')
}
