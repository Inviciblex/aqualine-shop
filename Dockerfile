# ── Сборка фронтенда ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Адрес API вшивается в момент сборки. По умолчанию /api/order — это полный эндпоинт
# заказа (фронт шлёт POST прямо на него, а статус строит как .../order/<id>). nginx
# проксирует /api/ на контейнер бэкенда. Можно переопределить через build-arg.
ARG VITE_ORDER_API_URL=/api/order
ARG VITE_SHEET_CSV_URL=
ARG VITE_IMG_PROXY=
ENV VITE_ORDER_API_URL=$VITE_ORDER_API_URL
ENV VITE_SHEET_CSV_URL=$VITE_SHEET_CSV_URL
ENV VITE_IMG_PROXY=$VITE_IMG_PROXY
RUN npm run build

# ── Раздача статики через nginx ──
# Непривилегированный образ nginx: работает от пользователя nginx (uid 101),
# не от root. Слушает 8080 (non-root не может биндить порты < 1024), pid и temp
# пишет в /tmp — это позволяет запускать контейнер с read_only-ФС.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Базовый образ уже работает от nginx (uid 101); указываем USER явно —
# это и фиксирует намерение, и проходит статическую проверку Trivy (DS-0002).
USER nginx
EXPOSE 8080

# Healthcheck в самом образе (как у api в server/Dockerfile) — образ
# самодостаточен: проверка работает и при `docker run`, и в любом compose,
# даже если там она не переопределена. wget есть в busybox базового alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
