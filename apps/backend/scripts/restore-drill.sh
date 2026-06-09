#!/usr/bin/env bash
# Restore latest age-encrypted dump into a parallel test database inside the
# byerag-postgres container and verify table-count parity. Per
# byerag-doc/docs/adr/backups-pg-dump-and-restore-drill.md. Operator runs
# monthly to assert backups are restorable.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ENV_FILE=$BACKEND_DIR/.env
[ -f "$ENV_FILE" ] || {
	echo "[restore-drill] FATAL: $ENV_FILE missing" >&2
	exit 2
}
while IFS= read -r line; do
	case "$line" in
	'' | '#'*) ;;
	POSTGRES_USER=* | POSTGRES_DB=* | BACKUP_DEST=* | BACKUP_AGE_IDENTITY=* | RESTORE_TEST_DB=* | PG_CONTAINER=*)
		export "${line%%=*}=$(printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//')"
		;;
	esac
done <"$ENV_FILE"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_DEST:?BACKUP_DEST required}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY required (path to age identity file)}"
RESTORE_TEST_DB=${RESTORE_TEST_DB:-byerag_restore_test}
PG_CONTAINER=${PG_CONTAINER:-byerag-postgres-1}
LATEST=
for candidate in "$BACKUP_DEST"/byerag-*.sql.age; do
	[ -e "$candidate" ] || continue
	if [ -z "$LATEST" ] || [ "$candidate" -nt "$LATEST" ]; then
		LATEST=$candidate
	fi
done
[ -n "$LATEST" ] || {
	echo "[restore-drill] FATAL: no dump in $BACKUP_DEST" >&2
	exit 1
}
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$TMP" "$LATEST"
docker exec -i "$PG_CONTAINER" psql --username="$POSTGRES_USER" --dbname=postgres \
	-c "DROP DATABASE IF EXISTS $RESTORE_TEST_DB" >/dev/null
docker exec -i "$PG_CONTAINER" psql --username="$POSTGRES_USER" --dbname=postgres \
	-c "CREATE DATABASE $RESTORE_TEST_DB" >/dev/null
docker exec -i "$PG_CONTAINER" psql --username="$POSTGRES_USER" --dbname="$RESTORE_TEST_DB" --quiet <"$TMP" >/dev/null
TBL_PROD=$(docker exec "$PG_CONTAINER" psql -tA --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
	-c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
TBL_REST=$(docker exec "$PG_CONTAINER" psql -tA --username="$POSTGRES_USER" --dbname="$RESTORE_TEST_DB" \
	-c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
docker exec "$PG_CONTAINER" psql --username="$POSTGRES_USER" --dbname=postgres \
	-c "DROP DATABASE IF EXISTS $RESTORE_TEST_DB" >/dev/null
[ "$TBL_PROD" = "$TBL_REST" ] || {
	echo "[restore-drill] FAIL table count prod=$TBL_PROD restore=$TBL_REST" >&2
	exit 1
}
echo "[restore-drill] ok dump=$LATEST tables=$TBL_REST (parity with prod)"
