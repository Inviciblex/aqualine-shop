#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
#  Бэкап базы заказов (SQLite orders.db) — без остановки сервиса.
# ─────────────────────────────────────────────────────────────────────────
#  Снимок делается командой `VACUUM INTO` ВНУТРИ api-контейнера: это
#  консистентная копия даже при работающей базе (в отличие от простого cp,
#  который может скопировать файл «на середине» записи). Затем снимок
#  выгружается на хост и сжимается, а старые бэкапы удаляются.
#
#  Запуск вручную:
#      sh deploy/backup.sh
#
#  По расписанию (пример crontab — каждый день в 3:30 ночи):
#      30 3 * * * cd /путь/к/проекту && sh deploy/backup.sh >> backups/backup.log 2>&1
#
#  Переопределяемые переменные окружения (со значениями по умолчанию):
#      COMPOSE_FILE=docker-compose.prod.yml   какой compose использовать
#      SERVICE=api                            имя сервиса с базой
#      DB_PATH=/data/orders.db                путь к базе внутри контейнера
#      OUT_DIR=./backups                      куда складывать бэкапы на хосте
#      KEEP_DAYS=30                           сколько дней хранить бэкапы
# ─────────────────────────────────────────────────────────────────────────
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="${SERVICE:-api}"
DB_PATH="${DB_PATH:-/data/orders.db}"
OUT_DIR="${OUT_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

TS=$(date +%Y%m%d-%H%M%S)
SNAP="/data/_snapshot-$TS.db" # временный снимок внутри тома
OUT="$OUT_DIR/orders-$TS.db"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

mkdir -p "$OUT_DIR"

echo "[backup] консистентный снимок базы (VACUUM INTO)…"
dc exec -T "$SERVICE" node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB_PATH || '$DB_PATH');
  db.exec(\"VACUUM INTO '$SNAP'\");
  db.close();
" 2>/dev/null

echo "[backup] выгрузка на хост → $OUT"
dc cp "$SERVICE:$SNAP" "$OUT"
dc exec -T "$SERVICE" rm -f "$SNAP" # убираем временный снимок из тома

gzip -f "$OUT"
echo "[backup] готово: $OUT.gz"

echo "[backup] удаляю бэкапы старше $KEEP_DAYS дн.…"
find "$OUT_DIR" -name 'orders-*.db.gz' -type f -mtime "+$KEEP_DAYS" -print -delete 2>/dev/null || true

echo "[backup] текущие бэкапы:"
ls -1t "$OUT_DIR"/orders-*.db.gz 2>/dev/null | head -5 || echo "  (пока нет)"
