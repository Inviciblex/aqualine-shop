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
| `ADMIN_TOKEN`    | Секрет для входа в админку (`/admin`). Пусто → выключена       |
| `PORT`           | Порт бэкенда (по умолчанию 8787)                              |
| `DB_PATH`        | Путь к файлу базы (по умолчанию `orders.db` рядом с сервером)  |

## Эндпоинты

| Метод | Путь                          | Назначение                              |
|-------|-------------------------------|-----------------------------------------|
| GET   | `/api/health`                 | Проверка работоспособности              |
| POST  | `/api/order`                  | Создать заказ (от сайта)                |
| GET   | `/api/order/<id>`             | Статус заказа по номеру (для покупателя)|
| GET   | `/api/announcement`           | Объявление-баннер для сайта (публичный)  |
| GET   | `/api/admin/orders`           | Все заказы (нужен заголовок `X-Admin-Token`) |
| POST  | `/api/admin/order/<id>/status`| Сменить статус (нужен `X-Admin-Token`)  |
| GET   | `/api/admin/announcement`     | Текущее объявление (нужен `X-Admin-Token`) |
| POST  | `/api/admin/announcement`     | Задать/включить/выключить (нужен `X-Admin-Token`) |

Объявление-баннер (напр. «магазин не работает такого-то числа») владелец
включает и меняет в админке `/admin` — текст хранится в БД (таблица `settings`) и
показывается всем посетителям сайта. Публичный `GET /api/announcement` отдаёт
только включённое объявление.

Товарами управляет вкладка «Товары» в `/admin` (эндпоинты `/api/admin/product/*`:
создание/изменение/удаление, загрузка/перестановка/удаление фото). Каталог витрины
читается из `GET /api/products`.

Админ-эндпоинты работают только если задан `ADMIN_TOKEN` и в запросе есть верный
заголовок `X-Admin-Token`. Дополнительно можно прикрыть `/admin` базовой
аутентификацией Nginx или ограничением по IP.

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
