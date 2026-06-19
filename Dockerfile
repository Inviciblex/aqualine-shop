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
ENV VITE_ORDER_API_URL=$VITE_ORDER_API_URL
ENV VITE_SHEET_CSV_URL=$VITE_SHEET_CSV_URL
RUN npm run build

# ── Раздача статики через nginx ──
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
