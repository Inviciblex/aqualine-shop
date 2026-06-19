#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────
#  Бэкап базы заказов (SQLite) из Docker-тома в сжатый файл с ротацией.
#
#  Использует sqlite3 ".backup" во временном контейнере — это онлайн-бэкап
#  через API SQLite, консистентный даже если в момент копирования идёт запись
#  (в отличие от простого cp файла .db).
#
#  Запуск (с сервера, рядом с docker-compose.prod.yml):
#      ./scripts/backup-db.sh
#
#  Параметры через переменные окружения:
#      DB_VOLUME   имя docker-тома с базой   (по умолчанию: aqualine-shop_db)
#      BACKUP_DIR  куда складывать бэкапы     (по умолчанию: ./backups)
#      KEEP        сколько последних хранить  (по умолчанию: 14)
#
#  Имя тома можно узнать командой:  docker volume ls | grep db
# ─────────────────────────────────────────────────────────────────────────
set -eu

DB_VOLUME="${DB_VOLUME:-aqualine-shop_db}"
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/orders-$TS.db.gz"

# Том монтируется rw, чтобы sqlite мог взять блокировки; бэкап пишется во
# временный файл внутри контейнера и потоком уходит на хост через gzip.
docker run --rm -v "$DB_VOLUME":/data alpine:latest sh -c \
  'apk add --no-cache sqlite >/dev/null 2>&1 && sqlite3 /data/orders.db ".backup /tmp/backup.db" && cat /tmp/backup.db' \
  | gzip > "$OUT"

# Проверяем, что файл не пустой (иначе бэкап провалился).
if [ ! -s "$OUT" ]; then
  echo "ОШИБКА: бэкап пустой, удаляю $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
echo "Бэкап готов: $OUT ($(du -h "$OUT" | cut -f1))"

# Ротация: оставляем только KEEP последних.
ls -1t "$BACKUP_DIR"/orders-*.db.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "Удалён старый бэкап: $old"
done
