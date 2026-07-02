// Service worker: базовый офлайн и ускорение повторных визитов. Без зависимостей.
// Стратегии:
//   • навигации — network-first с фолбэком на кэш index.html (офлайн-каталог);
//   • /assets/* (хешированные, immutable) — cache-first;
//   • products.json — stale-while-revalidate (мгновенно из кэша + обновление);
//   • внешние хосты (image-proxy, Google-таблица) — не трогаем.
const CACHE = 'aqualine-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {}),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) {
    const cache = await caches.open(CACHE)
    cache.put(req, res.clone())
  }
  return res
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req)
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => null)
  return cached || (await network) || Response.error()
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // внешние ресурсы не кэшируем

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')))
    return
  }
  if (url.pathname.endsWith('/products.json')) {
    e.respondWith(staleWhileRevalidate(req))
    return
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(cacheFirst(req))
  }
})
