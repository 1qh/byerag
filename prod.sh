#!/bin/sh
set -eu

ROOT=$(cd "$(dirname "$0")" && pwd)
PORTS_FILE="$ROOT/.cache/prod/pids"
LOG_DIR="$ROOT/.cache/prod"
mkdir -p "$LOG_DIR"

cleanup() {
	echo "shutting down..."
	if [ -f "$PORTS_FILE" ]; then
		while read -r pid; do
			kill "$pid" 2>/dev/null || true
		done <"$PORTS_FILE"
		rm -f "$PORTS_FILE"
	fi
}
trap cleanup INT TERM EXIT

echo "[1/5] docker compose up (postgres + convex-backend + clamav)..."
docker compose up -d --wait >/dev/null 2>&1 || {
	echo "ERROR: docker compose failed" >&2
	docker compose up -d
	exit 1
}

echo "[2/5] checking ollama on 127.0.0.1:11434..."
curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 || {
	echo "ERROR: ollama not reachable. start with 'ollama serve' or 'brew services start ollama'" >&2
	exit 1
}

echo "[3/5] convex deploy..."
bun --filter=backend run deploy >"$LOG_DIR/convex-deploy.log" 2>&1 || {
	echo "ERROR: convex deploy failed — see $LOG_DIR/convex-deploy.log" >&2
	tail -20 "$LOG_DIR/convex-deploy.log"
	exit 1
}

echo "[4/5] build admin + user (turbo)..."
bun run build >"$LOG_DIR/build.log" 2>&1 || {
	echo "ERROR: build failed — see $LOG_DIR/build.log" >&2
	tail -30 "$LOG_DIR/build.log"
	exit 1
}

echo "[5/5] starting admin (3001) + user (3003)..."
: >"$PORTS_FILE"
(cd apps/admin && bun --env-file=../backend/.env next start --port 3001 >"$LOG_DIR/admin.log" 2>&1) &
echo $! >>"$PORTS_FILE"
(cd apps/user && bun --env-file=../backend/.env next start --port 3003 >"$LOG_DIR/user.log" 2>&1) &
echo $! >>"$PORTS_FILE"

deadline=$(($(date +%s) + 60))
while
	! curl -fsS -o /dev/null http://127.0.0.1:3001/ 2>/dev/null \
	|| ! curl -fsS -o /dev/null http://127.0.0.1:3003/ 2>/dev/null
do
	[ "$(date +%s)" -gt "$deadline" ] && {
		echo "ERROR: admin/user did not come up in 60s" >&2
		echo "--- admin tail ---" >&2
		tail -20 "$LOG_DIR/admin.log" >&2
		echo "--- user tail ---" >&2
		tail -20 "$LOG_DIR/user.log" >&2
		exit 1
	}
	sleep 2
done

cat <<EOF

byerag up.

  Convex backend  http://127.0.0.1:3210
  Convex HTTP     http://127.0.0.1:3211
  Admin app       http://localhost:3001
  User app        http://localhost:3003
  Ollama          http://127.0.0.1:11434
  Logs            $LOG_DIR/

Ctrl-C to stop admin + user. Convex / Postgres / Clamav stay running
(run 'docker compose down' to stop those).
EOF

trap - EXIT
wait
