import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { FavoritesProvider } from './context/FavoritesContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initTheme } from './theme.js'

// Служебная страница /admin — самостоятельное React-приложение (вкладки Брони/
// Товары/Объявление на заголовке X-Admin-Token). Грузится отдельным чанком и
// только при заходе на /admin, чтобы не утяжелять бандл витрины. Витрине не
// нужны её провайдеры (корзина/избранное), поэтому монтируем в обход App.
const Admin = lazy(() => import('./admin/Admin.jsx'))
const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin'
// Шрифты локально (без Google Fonts CDN). Берём только нужные сабсеты —
// кириллицу и латиницу; греческий/вьетнамский/-ext не тянем (сайт русский),
// это втрое режет вес шрифтового CSS.
import '@fontsource/inter/cyrillic-400.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/cyrillic-500.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/cyrillic-600.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/cyrillic-700.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/jetbrains-mono/cyrillic-500.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/cyrillic-600.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './index.css'

initTheme()

// PWA service worker — только в проде (в dev мешал бы кэшированием). Офлайн
// app-shell и ускорение повторных визитов; регистрируем после загрузки страницы.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isAdminRoute ? (
        <Suspense fallback={<div className="state">Загрузка…</div>}>
          <Admin />
        </Suspense>
      ) : (
        <FavoritesProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </FavoritesProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
)
