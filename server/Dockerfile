# Бэкенд: Node 22 (встроенный node:sqlite), без внешних зависимостей.
# Пин по минорной версии — воспроизводимость и контроль над обновлениями базового образа.
# ВАЖНО: нужен >= 22.13 — в более ранних 22.x node:sqlite спрятан за флагом
# --experimental-sqlite и импорт падает с ERR_UNKNOWN_BUILTIN_MODULE.
FROM node:22.16-alpine

# tini как init-процесс (PID 1): корректная обработка сигналов и сбор zombie-процессов.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production
# База лежит в /data — этот путь монтируется как том (см. docker-compose),
# поэтому заказы переживают пересборку и обновление контейнера.
ENV DB_PATH=/data/orders.db

# Каталог под том заранее создаём и отдаём непривилегированному пользователю node
# (он уже есть в официальном образе, uid/gid 1000): named volume наследует
# права этого каталога при первом монтировании, иначе запись от non-root упадёт.
RUN mkdir -p /data && chown node:node /data

# Копируем исходники сразу под пользователя node, чтобы код не принадлежал root.
COPY --chown=node:node . .

# Запуск от непривилегированного пользователя — без прав root внутри контейнера.
USER node

EXPOSE 8787

# Проверка живости: сервис считается healthy, только если отвечает на порту.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini как entrypoint, чтобы node не был PID 1.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
