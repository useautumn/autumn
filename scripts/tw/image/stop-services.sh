#!/usr/bin/env bash
#
# stop-services.sh — CLEAN-STOP the stateful daemons for a consistent
# filesystem snapshot (plan §5a step 6, §4b step 5).
#
# Vercel snapshots are FILESYSTEM-ONLY — process memory is NOT preserved — so
# every service must be cold-startable from disk. That means flushing in-memory
# state to disk BEFORE the snapshot:
#   - PostgreSQL: pg_ctl -m fast stop -w  (clean shutdown, checkpoints to disk)
#   - Dragonfly:  SAVE (persist dump) then SHUTDOWN NOSAVE
#   - elasticmq:  SIGTERM (queues are re-declared from config on next boot)
#
# Best-effort + idempotent: a service that is already stopped is fine.
set -euo pipefail

log() { echo "[tw-stop-services] $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
PGDATA="${PGDATA:-$TW_PREFIX/pgdata}"
# goaws (native SQS) replaced elasticmq — no on-disk config needed at stop time.
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"

PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6380}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
SUPERVISORD_CONF="/etc/supervisor/supervisord.conf"

PG_BINDIR=""
for candidate in /usr/pgsql-18/bin /usr/lib/postgresql/18/bin /usr/bin "$BIN_DIR"; do
  if [ -x "$candidate/pg_ctl" ]; then
    PG_BINDIR="$candidate"
    break
  fi
done
export PATH="${PG_BINDIR:-/usr/bin}:$BIN_DIR:$HOME/.bun/bin:$PATH"

# PG refuses to run as root; on Modal (sandboxes run as root) drive pg_ctl as the
# `postgres` user that owns PGDATA. No-op on the non-root Vercel µVM. Mirrors
# start-services.sh's run_pg.
run_pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- env "PATH=$PATH" "$@"
  else
    "$@"
  fi
}

# ---------------------------------------------------------------------------
# 1. PostgreSQL — fast clean shutdown (checkpoints, no client wait).
# ---------------------------------------------------------------------------
if command -v pg_ctl >/dev/null 2>&1 && run_pg pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  log "Stopping PostgreSQL (-m fast)"
  run_pg pg_ctl -D "$PGDATA" -m fast -w stop || log "WARN: pg_ctl stop returned non-zero"
else
  log "PostgreSQL not running"
fi

# ---------------------------------------------------------------------------
# 2. Dragonfly — SAVE to disk, then SHUTDOWN NOSAVE (SAVE already flushed).
# ---------------------------------------------------------------------------
if redis-cli -p "$DRAGONFLY_PORT" PING >/dev/null 2>&1; then
  log "Dragonfly SAVE then SHUTDOWN NOSAVE"
  redis-cli -p "$DRAGONFLY_PORT" SAVE >/dev/null 2>&1 || log "WARN: Dragonfly SAVE failed"
  # SHUTDOWN closes the connection -> redis-cli reports an error; that's expected.
  redis-cli -p "$DRAGONFLY_PORT" SHUTDOWN NOSAVE >/dev/null 2>&1 || true
else
  log "Dragonfly not running"
fi

# ---------------------------------------------------------------------------
# 3. goaws — SIGTERM. Queues are re-declared from config on next boot, so no
#    on-disk state needs preserving. Match the binary path to avoid killing the
#    pkill/script itself (the config path contains "goaws").
# ---------------------------------------------------------------------------
if pgrep -f "$BIN_DIR/goaws" >/dev/null 2>&1; then
  log "SIGTERM goaws"
  pkill -TERM -f "$BIN_DIR/goaws" || true
else
  log "goaws not running"
fi

# ---------------------------------------------------------------------------
# 4. Tinybird Local — supervisorctl shutdown TERMs every program (Redis persists
#    via AOF, ClickHouse checkpoints), then wait so the snapshot is consistent.
# ---------------------------------------------------------------------------
if pgrep -x supervisord >/dev/null 2>&1 && [ -f "$SUPERVISORD_CONF" ]; then
  log "Shutting down Tinybird Local (supervisorctl shutdown)"
  supervisorctl -c "$SUPERVISORD_CONF" shutdown >/dev/null 2>&1 || true
  # Redis has stopwaitsecs=60 and ClickHouse checkpoints — allow up to 3 min.
  for _ in $(seq 1 720); do
    pgrep -x supervisord >/dev/null 2>&1 || break
    sleep 0.25
  done
  if pgrep -x supervisord >/dev/null 2>&1; then
    log "WARN: supervisord still alive after 180s — SIGKILL stragglers"
    pkill -KILL -x supervisord || true
    pkill -KILL -x clickhouse-serv || true
    pkill -KILL -x redis-server || true
  fi
else
  log "Tinybird Local not running"
fi

# ---------------------------------------------------------------------------
# 5. Standalone ClickHouse (optional) — graceful SIGTERM if present. Skipped
#    implicitly when Tinybird Local owns ClickHouse (supervisord already stopped it).
# ---------------------------------------------------------------------------
if pgrep -f 'clickhouse server' >/dev/null 2>&1; then
  log "SIGTERM ClickHouse"
  pkill -TERM -f 'clickhouse server' || true
fi

log "Clean-stop complete — filesystem is snapshot-consistent"
