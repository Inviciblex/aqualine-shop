# Бэкенд заказов (SQLite + Telegram)

Маленький Node-сервер: принимает заказ на `POST /api/order`, сохраняет его в
файловую базу **SQLite** (`orders.db`), присваивает номер и пересылает в Telegram.
Отдаёт статус заказа по номеру (`GET /api/order/<id>`). Токен бота хранится только
здесь, в `.env`, и в браузер не попадает.

## Запуск

Нужен **Node.js 22+** (используется встроенный модуль `node:sqlite`). Внешних
зависимостей и сборки нет.

```bash
cp .env.example .env     # затем заполните токен, чат, домен
node server.js
```

Проверка: `http://localhost:8787/api/health` → `{"ok":true}`.

База создаётся автоматически при первом запуске (файл `orders.db` рядом с
сервером; путь можно изменить переменной `DB_PATH`).

## Переменные (.env)

| Переменная       | Что это                                                        |
|------------------|----------------------------------------------------------------|
| `TG_BOT_TOKEN`   | Токен бота от @BotFather                                        |
| `TG_CHAT_ID`     | ID чата, куда приходят заказы                                   |
| `ALLOWED_ORIGIN` | Домен(ы) сайта для CORS, через запятую, без слэша              |
| `ADMIN_EMAILS`   | Email админов через запятую — вход в `/admin` по аккаунту с таким email |
| `ADMIN_TOKEN`    | Аварийный fallback-вход по `X-Admin-Token`. Пусто → fallback выкл.      |
| `SESSION_SECRET` | Секрет подписи сессионных кук кабинета/админки (в проде обязателен)     |
| `PORT`           | Порт бэкенда (по умолчанию 8787)                              |
| `DB_PATH`        | Путь к файлу базы (по умолчанию `orders.db` рядом с сервером)  |

## Эндпоинты

| Метод | Путь                          | Назначение                              |
|-------|-------------------------------|-----------------------------------------|
| GET   | `/api/health`                 | Проверка работоспособности              |
| POST  | `/api/order`                  | Создать заказ (от сайта)                |
| GET   | `/api/order/<id>`             | Статус заказа по номеру (для покупателя)|
| GET   | `/api/announcement`           | Объявление-баннер для сайта (публичный)  |
| GET   | `/api/maintenance`            | Режим техработ для сайта (публичный)     |
| GET   | `/api/admin/orders`           | Все заказы (нужен заголовок `X-Admin-Token`) |
| POST  | `/api/admin/order/<id>/status`| Сменить статус (нужен `X-Admin-Token`)  |
| GET   | `/api/admin/announcement`     | Текущее объявление (нужен `X-Admin-Token`) |
| POST  | `/api/admin/announcement`     | Задать/включить/выключить (нужен `X-Admin-Token`) |
| POST  | `/api/auth/register`          | Регистрация `{email, password, name?, phone?}` |
| POST  | `/api/auth/login`             | Вход `{email, password}` — ставит сессионную куку |
| POST  | `/api/auth/logout`            | Выход — очищает куку |
| GET   | `/api/auth/me`                | Текущий пользователь (или `{ok:false}`) |
| POST  | `/api/auth/profile`           | Обновить имя/телефон (нужна сессия) |
| POST  | `/api/auth/password`          | Сменить пароль `{current, next}` (нужна сессия) |
| GET   | `/api/orders`                 | Брони текущего аккаунта (нужна сессия) |
| GET   | `/api/admin/maintenance`      | Текущий режим техработ (нужен доступ админа) |
| POST  | `/api/admin/maintenance`      | Вкл/выкл техработы `{on, message}` (нужен доступ админа) |

Личный кабинет (email + пароль): пароль хранится как scrypt-хеш, сессия — в
подписанной httpOnly-куке `aq_session` (HMAC, 30 дней, без таблицы сессий; смена
пароля разлогинивает старые устройства). Задайте `SESSION_SECRET` и `COOKIE_SECURE=1`
в проде. Бронь связывается с аккаунтом через `orders.user_id` (у гостевых броней
NULL — **гостевое оформление остаётся основным путём и ничем не ограничено**).
Таблица `users` содержит ПДн (email, имя, телефон) — это, как и `orders`, требует
хостинга в РФ по 152-ФЗ; включайте кабинет только после решения по инфраструктуре.

Объявление-баннер (напр. «магазин не работает такого-то числа») владелец
включает и меняет в админке `/admin` — текст хранится в БД (таблица `settings`) и
показывается всем посетителям сайта. Публичный `GET /api/announcement` отдаёт
только включённое объявление.

Товарами управляет вкладка «Товары» в `/admin` (эндпоинты `/api/admin/product/*`:
создание/изменение/удаление, загрузка/перестановка/удаление фото). Каталог витрины
читается из `GET /api/products`.

Доступ в админку: основной способ — вошедший аккаунт, чей email в `ADMIN_EMAILS`
(права выдаются по сессионной куке автоматически). Аварийный fallback — заголовок
`X-Admin-Token` равный `ADMIN_TOKEN`. Админ-эндпоинты открыты, если задан
`ADMIN_EMAILS` или `ADMIN_TOKEN`. Ответы гейта: 401 — не вошёл, 403 — вошёл, но
не админ. Дополнительно можно прикрыть `/admin` базовой аутентификацией Nginx или
ограничением по IP.

## Автозапуск через systemd (Linux)

Создайте `/etc/systemd/system/aqualine-orders.service`:

```ini
[Unit]
Description=Aqualine order server
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/aqualine/server
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aqualine-orders
sudo systemctl status aqualine-orders     # проверить, что работает
```

## Проксирование через Nginx (фронт и бэкенд на одном домене)

Если сайт и бэкенд на одном домене, удобно отдавать `/api/` на бэкенд, а остальное
— как статику. Тогда на фронте в `.env` достаточно `VITE_ORDER_API_URL=/api/order`,
и проблем с CORS нет.

```nginx
server {
    listen 443 ssl;
    server_name shop.example.ru;

    root /var/www/aqualine/dist;
    index index.html;

    # заказы → на Node-бэкенд
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # всё остальное — статика магазина
    location / {
        try_files $uri /index.html;
    }

    # ssl_certificate ... ;
    # ssl_certificate_key ... ;
}
```

При такой схеме `ALLOWED_ORIGIN` можно оставить вашим доменом — запросы и так идут
с того же origin.

## Бессерверная альтернатива

Если не хотите держать процесс на сервере, ту же логику (из `server.js`) можно
положить в бессерверную функцию: Vercel `api/order.js`, Cloudflare Worker или
Netlify Function. Токен задаётся в переменных окружения функции в панели сервиса.
```
