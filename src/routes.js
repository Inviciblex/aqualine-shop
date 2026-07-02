// Сопоставление пути с маршрутом — чистая функция без DOM и без import.meta,
// поэтому покрывается юнит-тестами в node:test. Роутер (src/router.js) сначала
// убирает базовый префикс сборки, а сюда передаёт «прикладной» путь от корня.
//
// Маршруты (настоящие URL, History-роутинг):
//   /                 → каталог (и любой неизвестный путь — SPA-фоллбэк)
//   /product/<id>     → страница товара
//   /orders           → мои брони
//   /favorites        → избранное
//   /contacts         → контакты
//   /privacy          → политика конфиденциальности
//   /warranty         → гарантия
//   /returns          → возврат и обмен
//   /guides           → как выбрать

const STATIC = {
  '/orders': 'orders',
  '/favorites': 'favorites',
  '/contacts': 'contacts',
  '/privacy': 'privacy',
  '/warranty': 'warranty',
  '/returns': 'returns',
  '/guides': 'guides',
}

export function matchRoute(pathname) {
  // Нормализуем: убираем хвостовые слэши, пустой путь трактуем как корень.
  const p = (pathname || '/').replace(/\/+$/, '') || '/'

  const m = p.match(/^\/product\/(\d+)$/)
  if (m) return { name: 'product', id: Number(m[1]) }

  const name = STATIC[p]
  if (name) return { name }

  return { name: 'catalog' }
}
