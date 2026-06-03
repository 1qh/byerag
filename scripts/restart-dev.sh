#!/bin/sh
set -e
pkill -f 'next dev --turbo --port 3001' 2>/dev/null || true
pkill -f 'next dev --turbo --port 3003' 2>/dev/null || true
sleep 1
rm -rf apps/admin/.next apps/admin/.turbo apps/user/.next apps/user/.turbo
bun --filter=admin dev >/tmp/admin-dev.log 2>&1 &
bun --filter=user dev >/tmp/user-dev.log 2>&1 &
disown 2>/dev/null || true
echo "dev servers respawning; tail /tmp/admin-dev.log /tmp/user-dev.log"
