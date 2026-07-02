import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Базовый путь. './' (относительные пути) — самый надёжный вариант: работает
// и в корне домена (https://example.com/), и в подпапке (https://example.com/shop/),
// без дополнительной настройки. Если используете клиентский роутинг с вложенными
// адресами, тогда укажите явный путь, например '/shop/'.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // React/react-dom меняются редко — выносим в отдельный стабильный чанк,
        // чтобы правка компонента не инвалидировала весь бандл в кэше браузера.
        // Vite 8 (rolldown) требует функцию, а не объект.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
  server: {
    // host: true — dev-сервер виден в локальной сети, чтобы открывать с телефона.
    // При запуске npm run dev в терминале появится строка "Network: http://<IP>:5173".
    host: true,
    port: 5173,
    // Разрешаем заходить через туннель cloudflared (адрес меняется каждый запуск,
    // поэтому разрешаем все его поддомены). Это нужно только для dev-сервера;
    // на собранный сайт (npm run build) не влияет. Если используете другой
    // туннель (ngrok и т.п.) — добавьте его домен сюда же, или поставьте true,
    // чтобы разрешить любой хост на время локальной отладки.
    allowedHosts: ['.trycloudflare.com'],
  },
})
