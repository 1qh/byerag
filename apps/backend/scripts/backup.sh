#!/usr/bin/env bash
# Daily pg_dump of Convex's backing Postgres + age-encrypted output.
# Per byerag-docs/docs/adr/backups-pg-dump-and-restore-drill.md.
# Reads operator-local secrets/env. Encrypted dump lands in BACKUP_DEST.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ENV_FILE=$BACKEND_DIR/.env
[ -f "$ENV_FILE" ] || { echo "[backup] FATAL: $ENV_FILE missing" >&2; exit 2; }
set -a
. "$ENV_FILE"
set +a
: "${POSTGRES_HOST:?POSTGRES_HOST required}"
: "${POSTGRES_PORT:?POSTGRES_PORT required}"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_DEST:?BACKUP_DEST required (operator-local dir for encrypted dumps)}"
: "${BACKUP_AGE_PUBKEY:?BACKUP_AGE_PUBKEY required (age recipient public key)}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DEST"
DUMP_FILE=$BACKUP_DEST/byerag-$STAMP.sql.age
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT
pg_dump --no-owner --no-acl --format=plain \
  --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" > "$TMP_FILE"
age --encrypt --recipient "$BACKUP_AGE_PUBKEY" --output "$DUMP_FILE" "$TMP_FILE"
BYTES=$(wc -c < "$DUMP_FILE" | tr -d ' ')
echo "[backup] ok dump=$DUMP_FILE bytes=$BYTES stamp=$STAMP"
