# CONTEXT

Быстрая карта проекта для ориентации (в т.ч. для скилла `diagnosing-bugs`).
Глубина — в [README.md](README.md), [DEPLOY.md](DEPLOY.md), [GITFLOW.md](GITFLOW.md),
[LAUNCH.md](LAUNCH.md). Здесь — модель модулей и инварианты.

## Что это

«Аквалин» — интернет-магазин сантехники (RU). Модель: **онлайн-бронирование +
самовывоз**. НЕТ онлайн-оплаты, НЕТ доставки — оплата только при получении.
Не добавляйте платёжный/доставочный код: это противоречит бизнес-модели.

Стек: React 19 + Vite (rolldown), чистый CSS с дизайн-токенами и тёмной темой,
PWA. Бэкенд: Node + `node:sqlite`, Telegram-уведомления. Прод: Docker → nginx
(unprivileged) + отдельный api-контейнер, GHCR, CI на GitHub Actions.

## Архитектурный принцип

**Чистая логика вынесена из компонентов в отдельные модули** (без React/DOM/
`import.meta`), чтобы покрывать её `node:test`. Если правите поведение — правьте
чистый модуль и его тест, а не только компонент. Компоненты — тонкая оболочка.

## Фронтенд (`src/`)

- **`App.jsx`** — корень: свитч маршрутов, состояние фильтров, SEO-эффект, рендер
  шапки/каталога/модалок. `main.jsx` — точка входа.
- **Роутинг (History API):** `router.js` (`parseRoute`/`navigate`/`subscribe`/
  `syncSearch`, перехват кликов в capture-фазе, `safeHistory`), `routes.js`
  (чистый `matchRoute(pathname)`). Реальные URL (`/product/3`) — для индексации.
- **Каталог:** `catalog.js` (`useCatalog` + загрузчики), `catalog-source.js`
  (чистое: `resolveCatalog` с фолбэком, `sheetRowsToCatalog`, `normalizeJson`,
  `withOptimizedImages`), `catalog-parse.js` (`rowToProduct`: строка CSV→товар),
  `catalog-url.js` (фильтры ↔ query-параметры), `search.js` (поиск, устойчивый к
  раскладке/транслиту/опечаткам).
- **Корзина/бронь:** `cart-logic.js` (чистая логика), `context/CartContext.jsx`,
  `context/FavoritesContext.jsx`; `checkout-validate.js` (валидация формы),
  `customer.js` (сохранённые данные покупателя), `sendOrder.js` → `order-api.js`
  (обращения к бэкенду: `requestOrder`/`requestStatus`/`requestCancel`),
  `orders.js` (история броней в localStorage, `holdUntilMs`/`isOverdue`).
- **Прочее:** `seo.js` (title/meta/OG/canonical + JSON-LD Product/BreadcrumbList,
  `resetSeo`), `store.js` (адрес/часы/телефон/`HOLD_DAYS`/способы оплаты — ПРАВЯТ
  здесь перед запуском), `theme.js` (тёмная тема: `data-theme` + медиазапрос),
  `image-url.js` (image-proxy weserv, `onProxyImgError`), `useModalA11y.js`
  (фокус-трап), `recent.js`, `related.js`, `utils.js`.
- **Компоненты** (`src/components/`): `Header`, `ProductGrid`/`ProductCard`,
  `ProductDetail`, `Filters`, `CartDrawer`, `Checkout` (модалка брони, `if
  (!open) return null`), `MyOrders`, `Favorites`, контентные (`Contacts`,
  `Warranty`, `Returns`, `Guides`, `PrivacyPolicy`), скелетоны
  (`CatalogSkeleton`, `ProductSkeleton`), `CookieBanner`, `ErrorBoundary`.

## Бэкенд (`server/`)

- **`server.js`** — HTTP API заказов на `node:sqlite` (`DatabaseSync`, prepared
  statements, WAL). Схема: `orders` с `hold_until`. Эндпоинты: создание брони,
  статус, отмена клиентом, `POST /api/admin/order/:id/extend` (продление, за
  админ-токеном). Миграции — паттерн `try { ALTER TABLE } catch {}`.
- **`security.js`** — сравнение админ-токена constant-time, `clientIp`.
- **`notify.js`** — Telegram-уведомления о бронях.
- Админка: React-приложение на `/admin` (`src/admin/`, отдельный чанк, `noindex`,
  всё за токеном `X-Admin-Token`). Вкладки: Брони, Товары, Объявление.

## Сборка / деплой / CI

- **`Dockerfile`** (multi-stage): (1) компиляция динамического модуля Brotli под
  nginx **1.27.5**; (2) фронт — **`node scripts/sync-catalog.mjs`** (синк
  снапшота каталога из таблицы + товарных URL в `sitemap.xml`) → `vite build`;
  (3) runtime
  `nginxinc/nginx-unprivileged:1.27.5-alpine` + модуль brotli. `deploy/nginx.conf`
  (CSP, brotli+gzip, SPA-fallback, проксирование `/api/`).
- **CI** (`.github/workflows/deploy.yml`): `test:coverage` + eslint + **prettier**
  + trivy + lighthouse + verify; build/deploy — только на `develop`/`main`.
- **git-flow:** ветка от `develop` → PR → зелёный CI → merge → пересборка. Детали
  в [GITFLOW.md](GITFLOW.md).

## Тесты

`node:test` (без vitest/RTL). Фронт — `test/*.test.js`, бэк — `server/test/*`.
Пороги покрытия (фронт): **lines 88 / branches 82 / functions 85**. Новую чистую
логику — покрывать тестом, иначе покрытие просядет и CI упадёт.

## Гнилые места / гейты (частые причины сюрпризов)

- **Prettier — отдельный гейт CI**, независимый от тестов/eslint. Перед пушем:
  `npm run format` (файлы `{src,server,test}/**/*.{js,jsx,css}`).
- **Источник каталога — внешняя Google-таблица** (`VITE_SHEET_CSV_URL`). Рантайм:
  таблица → при сбое фолбэк на `public/products.json` (`resolveCatalog`). Снапшот
  `products.json` обновляется из таблицы **на Docker-сборке** (sync-скрипт,
  не валит сборку при сбое). В репозитории лежит **демо** products.json.
- **PWA service worker:** сеть-первым, но HTTP-кэш браузера может отдать старый
  `index.html`→старый бандл. При проверке в реальном браузере — cache-bust
  (`?cb=…`); чистка SW+Cache API HTTP-кэш НЕ чистит.
- **`history.replaceState` троттлится** (Safari бросает SecurityError после ~100
  вызовов/30с) — запись фильтров в URL дебаунсится (200мс). Не убирайте дебаунс.
- **Brotli-модуль привязан к версии nginx 1.27.5** — при бампе базового образа
  синхронно поднимайте `NGINX_VERSION` в стейдже `brotli` (иначе модуль не
  загрузится и nginx не стартует).
- **Тема:** акцент в тёмной теме намеренно яркий (для текста); фон под белым
  текстом использует отдельный токен `--accent-solid` (WCAG AA). Не сливайте их.
