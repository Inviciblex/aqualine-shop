import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { FavoritesProvider } from './context/FavoritesContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initTheme } from './theme.js'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FavoritesProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </FavoritesProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
