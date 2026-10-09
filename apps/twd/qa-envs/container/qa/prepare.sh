#!/usr/bin/env bash
# Clones the ref, installs deps, builds the dashboard and migrates the env's Neon branch.
# Source: /tmp/src.tar.gz when uploaded, else GIT_URL GIT_TOKEN GIT_SHA. Env: DATABASE_URL PUBLIC_URL. Nothing secret is written to disk.
set -euo pipefail
log() { echo "[qa-prepare] $(date -u +%H:%M:%S) $*"; }
t0=$(date +%s)

mkdir -p /app && cd /app
if [ -f /tmp/src.tar.gz ]; then
	log "extracting uploaded source over baked node_modules"
	tar -xzf /tmp/src.tar.gz -C /app && rm -f /tmp/src.tar.gz
else
	git init -q 2>/dev/null || true
	auth="Authorization: Basic $(printf 'x-access-token:%s' "$GIT_TOKEN" | base64 -w0)"
	log "fetching $GIT_SHA"
	git -c http.extraHeader="$auth" fetch -q --depth 1 "$GIT_URL" "$GIT_SHA"
	git checkout -q -f FETCH_HEAD
fi
log "fetched ($(( $(date +%s) - t0 ))s)"

# Only the workspaces the QA stack runs; a warm snapshot already holds most of these.
bun install --frozen-lockfile --filter autumn --filter ./server --filter ./vite --filter ./apps/balance-worker --filter ./scripts \
	>/tmp/install.log 2>&1 || { tail -50 /tmp/install.log; exit 1; }
log "installed ($(( $(date +%s) - t0 ))s)"
if [ "${PREPARE_MODE:-}" = deps ]; then
	log "deps-only warm prepare done ($(du -sh /app/node_modules | cut -f1))"
	exit 0
fi

migrate() {
	DATABASE_URL="$DATABASE_URL" AUTUMN_DB_DIRECT=1 bun db migrate --bootstrap >/tmp/migrate.log 2>&1 \
		|| { tail -50 /tmp/migrate.log; exit 1; }
	for f in $(grep -oE '"[A-Za-z0-9]+\.sql"' /app/scripts/dw/helpers/migration.ts | tr -d '"'); do
		psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "/app/server/src/internal/balances/utils/sql/$f" >>/tmp/migrate.log 2>&1 \
			|| { echo "loading $f failed"; tail -20 /tmp/migrate.log; exit 1; }
	done
}
migrate >/tmp/migrate.err 2>&1 &
migrate_pid=$!

(cd vite && VITE_BACKEND_URL=/__autumn_api VITE_FRONTEND_URL="$PUBLIC_URL" VITE_CAPY_DEV=1 \
	VITE_APP_ENV=dev CI=1 NODE_OPTIONS=--max-old-space-size=4096 bunx vite build >/tmp/vite.log 2>&1) \
	|| { tail -50 /tmp/vite.log; exit 1; }
log "dashboard built ($(( $(date +%s) - t0 ))s)"

wait "$migrate_pid" || { cat /tmp/migrate.err; exit 1; }
log "migrated ($(( $(date +%s) - t0 ))s)"

touch /app/.qa-ready
log "ready for snapshot ($(( $(date +%s) - t0 ))s, $(du -sh /app | cut -f1))"
