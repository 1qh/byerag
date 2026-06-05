#!/usr/bin/env bash
# Daily pg_dump of Convex's backing Postgres + age-encrypted output.
# Per byerag-doc/docs/adr/backups-pg-dump-and-restore-drill.md.
# Reads operator-local secrets/env. Encrypted dump lands in BACKUP_DEST.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ENV_FILE=$BACKEND_DIR/.env
[ -f "$ENV_FILE" ] || { echo "[backup] FATAL: $ENV_FILE missing" >&2; exit 2; }
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) ;;
    POSTGRES_USER=*|POSTGRES_DB=*|BACKUP_DEST=*|BACKUP_AGE_PUBKEY=*|PG_CONTAINER=*)
      export "${line%%=*}=$(printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//')"
      ;;
  esac
done < "$ENV_FILE"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_DEST:?BACKUP_DEST required (operator-local dir for encrypted dumps)}"
: "${BACKUP_AGE_PUBKEY:?BACKUP_AGE_PUBKEY required (age recipient public key)}"
PG_CONTAINER=${PG_CONTAINER:-byerag-postgres-1}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DEST"
DUMP_FILE=$BACKUP_DEST/byerag-$STAMP.sql.age
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT
docker exec "$PG_CONTAINER" pg_dump --no-owner --no-acl --format=plain \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" > "$TMP_FILE"
age --encrypt --recipient "$BACKUP_AGE_PUBKEY" --output "$DUMP_FILE" "$TMP_FILE"
BYTES=$(wc -c < "$DUMP_FILE" | tr -d ' ')
echo "[backup] ok dump=$DUMP_FILE bytes=$BYTES stamp=$STAMP"
