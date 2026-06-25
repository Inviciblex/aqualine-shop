#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
#  Восстановление базы заказов из бэкапа.
# ─────────────────────────────────────────────────────────────────────────
#  ОСТОРОЖНО: ЗАМЕНЯЕТ текущую orders.db содержимым бэкапа. Сервис на время
#  восстановления останавливается, чтобы база не менялась в процессе.
#
#  Использование:
#      sh deploy/restore.sh backups/orders-20260625-033000.db.gz
#      sh deploy/restore.sh backups/orders-20260625-033000.db      # и распакованный тоже
#
#  Переменные окружения — те же, что у backup.sh (COMPOSE_FILE, SERVICE, DB_PATH).
# ─────────────────────────────────────────────────────────────────────────
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="${SERVICE:-api}"
DB_PATH="${DB_PATH:-/data/orders.db}"

BACKUP="${1:-}"
[ -n "$BACKUP" ] || {
  echo "Использование: sh deploy/restore.sh <файл.db|.db.gz>"
  exit 1
}
[ -f "$BACKUP" ] || {
  echo "Файл не найден: $BACKUP"
  exit 1
}

printf "Это ЗАМЕНИТ текущую базу заказов содержимым «%s». Продолжить? [y/N] " "$BACKUP"
read -r ans
[ "$ans" = y ] || [ "$ans" = Y ] || {
  echo "Отменено."
  exit 0
}

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
case "$BACKUP" in
*.gz) gunzip -c "$BACKUP" >"$TMP" ;;
*) cp "$BACKUP" "$TMP" ;;
esac

echo "[restore] останавливаю $SERVICE…"
dc stop "$SERVICE"
echo "[restore] загружаю базу в том…"
dc cp "$TMP" "$SERVICE:$DB_PATH"
echo "[restore] запускаю $SERVICE…"
dc start "$SERVICE"
echo "[restore] готово. Проверьте заказы в админке."
