# ── Сборка модуля Brotli под nginx ──
# Стоковый nginx не включает Brotli, поэтому компилируем ngx_brotli как
# динамический модуль. Версия nginx-исходника ДОЛЖНА совпадать с runtime-образом
# ниже (1.27.5): динамический модуль грузится только в тот же билд nginx.
# Оба собраны с --with-compat, что и делает модуль загружаемым. При бампе
# runtime-образа обязательно поднимите NGINX_VERSION здесь синхронно.
FROM nginx:1.27.5-alpine AS brotli
ARG NGINX_VERSION=1.27.5
RUN apk add --no-cache --virtual .brotli-build \
      git gcc g++ make cmake pcre-dev zlib-dev openssl-dev linux-headers wget
WORKDIR /build
RUN wget -q -O nginx.tar.gz https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz \
    && tar -xzf nginx.tar.gz \
    && git clone --depth=1 --recurse-submodules https://github.com/google/ngx_brotli.git
# Статические библиотеки Brotli (без -march=native — образ может ехать на другом CPU).
RUN cd ngx_brotli/deps/brotli && mkdir -p out && cd out \
    && cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF .. \
    && cmake --build . --config Release --target brotlienc brotlidec brotlicommon
# Собираем только модули (не весь nginx) под текущую версию, с --with-compat.
RUN cd nginx-${NGINX_VERSION} \
    && ./configure --with-compat --add-dynamic-module=../ngx_brotli \
    && make -j"$(nproc)" modules

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
# Версия пришпилена к 1.27.5: под неё скомпилирован Brotli-модуль выше. Меняете
# тег — меняйте и NGINX_VERSION в стейдже brotli (иначе модуль не загрузится).
FROM nginxinc/nginx-unprivileged:1.27.5-alpine
# Подкладываем модуль и регистрируем его в main-контексте nginx.conf. Требует
# root (файлы образа принадлежат root), поэтому временно повышаемся и возвращаемся
# к nginx. Грузим только filter-модуль: динамическое сжатие «на лету», как gzip.
USER root
COPY --from=brotli /build/nginx-1.27.5/objs/ngx_http_brotli_filter_module.so \
     /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so
RUN { echo 'load_module /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so;'; \
      cat /etc/nginx/nginx.conf; } > /tmp/nginx.conf \
    && cp /tmp/nginx.conf /etc/nginx/nginx.conf && rm /tmp/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Возвращаемся к непривилегированному пользователю (uid 101): фиксирует намерение
# и проходит статическую проверку Trivy (DS-0002).
USER nginx
EXPOSE 8080

# Healthcheck в самом образе (как у api в server/Dockerfile) — образ
# самодостаточен: проверка работает и при `docker run`, и в любом compose,
# даже если там она не переопределена. wget есть в busybox базового alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
