#!/usr/bin/env bash
# Restore latest age-encrypted dump into a parallel test Postgres instance and
# verify row-count parity. Per byerag-docs/docs/adr/backups-pg-dump-and-restore-drill.md.
# Operator runs monthly to assert backups are restorable.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ENV_FILE=$BACKEND_DIR/.env
[ -f "$ENV_FILE" ] || { echo "[restore-drill] FATAL: $ENV_FILE missing" >&2; exit 2; }
set -a
. "$ENV_FILE"
set +a
: "${BACKUP_DEST:?BACKUP_DEST required}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY required (path to age identity file)}"
: "${RESTORE_TEST_DB:=byerag_restore_test}"
LATEST=$(ls -t "$BACKUP_DEST"/byerag-*.sql.age 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "[restore-drill] FATAL: no dump in $BACKUP_DEST" >&2; exit 1; }
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$TMP" "$LATEST"
psql --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname=postgres -c "DROP DATABASE IF EXISTS $RESTORE_TEST_DB" > /dev/null
psql --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname=postgres -c "CREATE DATABASE $RESTORE_TEST_DB" > /dev/null
psql --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname="$RESTORE_TEST_DB" --quiet --file="$TMP" > /dev/null
ROWS_PROD=$(psql -tA --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
ROWS_REST=$(psql -tA --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname="$RESTORE_TEST_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
psql --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname=postgres -c "DROP DATABASE IF EXISTS $RESTORE_TEST_DB" > /dev/null
[ "$ROWS_PROD" = "$ROWS_REST" ] || { echo "[restore-drill] FAIL table count prod=$ROWS_PROD restore=$ROWS_REST" >&2; exit 1; }
echo "[restore-drill] ok dump=$LATEST tables=$ROWS_REST (parity with prod)"
