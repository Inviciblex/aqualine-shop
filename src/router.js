// Мини-роутер на History API (настоящие URL вместо hash-фрагментов). Без
// внешних зависимостей. Даёт:
//   • parseRoute()            — текущий маршрут из window.location.pathname;
//   • navigate(to, {replace}) — программный переход (pushState + оповещение);
//   • syncSearch(url)         — тихо переписать query каталога (replaceState,
//                               без ре-рендера) для «фильтры в адресе»;
//   • subscribe(fn)           — подписка на смену адреса (навигация/назад-вперёд).
//
// Внутренние ссылки перехватываются одним делегированным обработчиком кликов,
// поэтому в разметке остаются обычные <a href="/product/3"> — они работают при
// правом клике, «открыть в новой вкладке» и для поисковых роботов, но по
// обычному клику не перезагружают страницу.
//
// ВАЖНО: для History-роутинга vite base должен быть '/' (абсолютные пути к
// /assets), а nginx — отдавать try_files $uri /index.html (см. deploy/nginx.conf).
import { matchRoute } from './routes.js'

// Базовый префикс сборки. При base '/' BASE === '' (пусто), пути не меняются.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

// Абсолютный путь приложения → путь с учётом базового префикса (для pushState).
function withBase(to) {
  if (!BASE) return to
  return to.startsWith('/') ? BASE + to : to
}

// Путь из адреса → «прикладной» путь (без базового префикса) для matchRoute.
function toAppPath(pathname) {
  if (BASE && pathname.startsWith(BASE)) return pathname.slice(BASE.length) || '/'
  return pathname
}

export function parseRoute() {
  return matchRoute(toAppPath(window.location.pathname))
}

// ── Подписчики на смену адреса ──
const listeners = new Set()
function notify() {
  for (const fn of listeners) fn()
}
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Программная навигация. pushState/replaceState не генерируют событий сами,
// поэтому оповещаем подписчиков вручную.
export function navigate(to, { replace = false } = {}) {
  const url = withBase(to)
  const currentUrl = window.location.pathname + window.location.search + window.location.hash
  // Тот же адрес — не плодим дубли в истории и лишние ре-рендеры.
  if (!replace && url === currentUrl) return
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  notify()
}

// Обновить только query каталога, НЕ оповещая подписчиков: состояние фильтров
// уже в React, повторный разбор адреса не нужен, а история не засоряется на
// каждый ввод (replaceState). Так «ссылка на отфильтрованную выдачу» работает.
export function syncSearch(url) {
  window.history.replaceState(null, '', withBase(url))
}

// Назад/вперёд браузера.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify)

  // Делегированный перехват кликов по внутренним ссылкам. Фаза capture (третий
  // аргумент true): срабатывает раньше bubble-обработчиков React, поэтому клики
  // по ссылкам внутри модалок со stopPropagation (например «Мои брони» на экране
  // успеха оформления) тоже перехватываются как SPA-навигация, а не как полная
  // перезагрузка.
  document.addEventListener(
    'click',
    (e) => {
      // Модифицированные клики (Ctrl/Cmd/Shift/Alt, средняя кнопка) и уже
      // обработанные (preventDefault) — отдаём браузеру как есть.
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const a = e.target.closest?.('a')
      if (!a) return
      // Новая вкладка, скачивание, внешние по rel — не наши.
      if (a.target && a.target !== '_self') return
      if (a.hasAttribute('download')) return
      if ((a.getAttribute('rel') || '').includes('external')) return

      const href = a.getAttribute('href')
      // Пустые и якоря (#main — «к содержимому») обрабатывает браузер нативно.
      if (!href || href.startsWith('#')) return
      // Только тот же origin и http(s): mailto:/tel:/внешние — не трогаем.
      if (a.origin !== window.location.origin) return
      if (a.protocol !== 'http:' && a.protocol !== 'https:') return
      // Реальные файлы (например /admin.html) — отдельные страницы, не SPA.
      if (/\.[a-z0-9]+$/i.test(a.pathname)) return

      e.preventDefault()
      navigate(a.pathname + a.search + a.hash)
    },
    true,
  )

  // Разовая миграция старых hash-ссылок (#/product/3, #/orders, #/?q=…),
  // оставшихся в закладках/кэше SW до перехода на History-роутинг.
  const h = window.location.hash
  if (h.startsWith('#/')) {
    window.history.replaceState(null, '', withBase(h.slice(1)))
  }
}
