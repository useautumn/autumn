#!/usr/bin/env bash
# (Re)starts the API server (:8080) and workers against local services.
# Neither hot-reloads, so run this after every checkout or source edit.
# Logs: ~/.autumn-agent/server.log and ~/.autumn-agent/workers.log
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LOG_DIR="${HOME}/.autumn-agent"
mkdir -p "$LOG_DIR"

# The server answers :8080 even with no DB behind it, so check infra first.
# Cloud VMs can restart under a session, which stops these services.
if ! pg_isready -q -h localhost -p 5432 || ! redis-cli -p 6379 ping >/dev/null 2>&1; then
	echo "local Postgres/Redis not running — start infra first:" >&2
	echo "  bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/dw/index.ts start" >&2
	exit 1
fi

# Match on the process's own argv (not `pkill -f`, which also matches this shell).
for pid in $(ps -eo pid=,args= | awk '$2 == "bun" && ($3 == "src/index.ts" || $3 == "src/workers.ts") { print $1 }'); do
	kill "$pid" 2>/dev/null || true
done
sleep 3

cd "$ROOT"
: >"$LOG_DIR/server.log"
: >"$LOG_DIR/workers.log"
nohup bash scripts/setup/claude-cloud/with-env.sh server -- bun src/workers.ts >>"$LOG_DIR/workers.log" 2>&1 &
nohup bash scripts/setup/claude-cloud/with-env.sh server -- bun src/index.ts >>"$LOG_DIR/server.log" 2>&1 &

for _ in $(seq 1 90); do
	if curl -sf -o /dev/null http://localhost:8080/; then
		echo "server up on :8080 (logs in $LOG_DIR)"
		exit 0
	fi
	sleep 2
done
echo "server did not come up — see $LOG_DIR/server.log" >&2
tail -20 "$LOG_DIR/server.log" >&2
exit 1
