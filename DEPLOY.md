# Деплой: GitHub Actions + Docker (CI/CD)

Схема: пушите код в `main` → GitHub Actions собирает два Docker-образа (фронт и
бэк), кладёт их в GitHub Container Registry (GHCR) → по SSH подключается к серверу
и обновляет контейнеры. На сервере нужен **только Docker** (ни Node, ни сборки).

```
 push в main ──▶ GitHub Actions ──▶ образы в GHCR ──▶ SSH на сервер ──▶ docker compose up -d
```

Фронт (nginx) раздаёт статику и проксирует `/api` на контейнер бэкенда, поэтому
всё работает на одном домене без CORS. База SQLite лежит в Docker-томе и
**не теряется** при обновлениях.

---

## Часть 1. Репозиторий на GitHub

1. Создайте репозиторий (можно приватный).
2. В папке проекта:
   ```bash
   git init
   git add .
   git commit -m "Аквалин: магазин сантехники"
   git branch -M main
   git remote add origin https://github.com/ВАШ_ЛОГИН/aqualine-shop.git
   git push -u origin main
   ```
   `.env` и `dist` уже в `.gitignore` — секреты и сборка в репозиторий не попадут.

---

## Часть 2. Подготовка сервера (один раз)

Нужен VPS с Ubuntu и установленным Docker.

1. Установите Docker и compose-плагин:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. Создайте папку деплоя и структуру:
   ```bash
   mkdir -p /opt/aqualine/server
   cd /opt/aqualine
   ```
3. Положите сюда `docker-compose.prod.yml` (скопируйте из репозитория).
4. Создайте `.env` (переменные для compose) — на основе `.env.deploy.example`:
   ```
   IMAGE_PREFIX=ghcr.io/ваш_логин_в_нижнем_регистре
   TAG=latest
   ```
5. Создайте `server/.env` (секреты приложения) — на основе `server/.env.example`:
   ```
   TG_BOT_TOKEN=...
   TG_CHAT_ID=...
   ADMIN_TOKEN=длинная_случайная_строка
   ALLOWED_ORIGIN=*
   ```
   (При проксировании `/api` через nginx запросы идут с того же домена, поэтому
   `ALLOWED_ORIGIN` можно оставить `*` или указать ваш домен.)

Итоговая структура на сервере:
```
/opt/aqualine/
├─ docker-compose.prod.yml
├─ .env                 # IMAGE_PREFIX, TAG
└─ server/.env          # TG_BOT_TOKEN, TG_CHAT_ID, ADMIN_TOKEN, ...
```

---

## Часть 3. Доступ Actions к серверу и реестру

### SSH-ключ для деплоя
На своём компьютере создайте пару ключей специально для деплоя:
```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
```
- Публичный ключ `deploy_key.pub` добавьте на сервер в `~/.ssh/authorized_keys`.
- Приватный ключ `deploy_key` целиком пойдёт в секрет `SSH_KEY` (см. ниже).

### Токен для скачивания образов на сервере
Новые образы в GHCR по умолчанию приватные, поэтому серверу нужен токен для
`docker login`. Создайте на GitHub **Personal Access Token (classic)** с правом
`read:packages` → это секрет `GHCR_TOKEN`.

> Альтернатива: в GitHub в настройках каждого пакета (`aqualine-web`,
> `aqualine-api`) выставить видимость **public** — тогда `GHCR_TOKEN` и строку
> `docker login` в workflow можно убрать.

### Секреты репозитория
GitHub → репозиторий → Settings → Secrets and variables → Actions → New secret:

| Секрет        | Значение                                            |
|---------------|-----------------------------------------------------|
| `SSH_HOST`    | IP или домен сервера                                |
| `SSH_USER`    | пользователь SSH (например, `root` или `deploy`)    |
| `SSH_KEY`     | содержимое приватного ключа `deploy_key`            |
| `DEPLOY_PATH` | путь папки деплоя, например `/opt/aqualine`         |
| `GHCR_TOKEN`  | PAT с правом `read:packages` (если образы приватные)|

---

## Часть 4. Первый запуск

После добавления секретов сделайте любой push в `main` (или запустите workflow
вручную: вкладка **Actions** → **Deploy** → **Run workflow**). Пайплайн соберёт
образы и развернёт их на сервере.

Откройте `http://ВАШ_СЕРВЕР` — должен открыться магазин. Админка —
`http://ВАШ_СЕРВЕР/admin.html`.

---

## Часть 5. Как обновлять код

Просто пушьте в `main`:
```bash
git add .
git commit -m "что изменили"
git push
```
Дальше всё автоматически: сборка → образы → деплой. Заказы в базе сохраняются
(том `db`).

> Товары можно менять и без деплоя — через Google Таблицу (если подключена) или
> отредактировав `products.json`. Но если каталог в репозитории, правка
> `public/products.json` + push тоже обновит его при следующей сборке.

---

## HTTPS (важно для боевого режима и админки)

Веб-контейнер слушает порт 80. Чтобы добавить HTTPS, поставьте перед ним
обратный прокси с сертификатом. Простые варианты:
- **Cloudflare** перед доменом (быстрее всего: проксирование + бесплатный TLS).
- **Caddy** или **Traefik** рядом (автоматический Let's Encrypt).
- Хостовый **Nginx + certbot** на 443, проксирующий на контейнер.

Админку (`/admin.html`) открывайте только по HTTPS — иначе токен можно перехватить.

---

## Откат и обслуживание

- **Откат на предыдущую версию:** каждый образ тегируется ещё и хешем коммита.
  На сервере в `.env` поставьте `TAG=<нужный_sha>` и выполните
  `docker compose -f docker-compose.prod.yml up -d`.
- **Логи:** `docker compose -f docker-compose.prod.yml logs -f`
- **Бэкап базы:** база — это том `db`. Скопировать файл наружу:
  ```bash
  docker compose -f docker-compose.prod.yml cp api:/data/orders.db ./orders-backup.db
  ```

---

## Локальная проверка через Docker (по желанию)

В папке проекта:
```bash
cp server/.env.example server/.env   # заполнить
docker compose up -d --build
```
Откройте `http://localhost`. Остановить: `docker compose down` (том с базой
останется; `docker compose down -v` удалит и базу).
