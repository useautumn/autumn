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
ELASTICMQ_CONF="${ELASTICMQ_CONF:-$TW_PREFIX/elasticmq/elasticmq.conf}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"

PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6379}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"

PG_BINDIR=""
for candidate in /usr/pgsql-18/bin /usr/lib/postgresql/18/bin /usr/bin "$BIN_DIR"; do
  if [ -x "$candidate/pg_ctl" ]; then
    PG_BINDIR="$candidate"
    break
  fi
done
export PATH="${PG_BINDIR:-/usr/bin}:$BIN_DIR:$HOME/.bun/bin:$PATH"

# ---------------------------------------------------------------------------
# 1. PostgreSQL — fast clean shutdown (checkpoints, no client wait).
# ---------------------------------------------------------------------------
if command -v pg_ctl >/dev/null 2>&1 && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  log "Stopping PostgreSQL (-m fast)"
  pg_ctl -D "$PGDATA" -m fast -w stop || log "WARN: pg_ctl stop returned non-zero"
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
# 3. elasticmq — SIGTERM. Queues are re-declared from config on next boot, so
#    no on-disk state needs preserving.
# ---------------------------------------------------------------------------
if pgrep -f 'elasticmq-native-server' >/dev/null 2>&1; then
  log "SIGTERM elasticmq-native"
  pkill -TERM -f 'elasticmq-native-server' || true
elif pgrep -f 'elasticmq.*\.jar' >/dev/null 2>&1; then
  log "SIGTERM elasticmq (jar)"
  pkill -TERM -f 'elasticmq.*\.jar' || true
else
  log "elasticmq not running"
fi

# ---------------------------------------------------------------------------
# 4. ClickHouse (optional) — graceful SIGTERM if present.
# ---------------------------------------------------------------------------
if pgrep -f 'clickhouse server' >/dev/null 2>&1; then
  log "SIGTERM ClickHouse"
  pkill -TERM -f 'clickhouse server' || true
fi

log "Clean-stop complete — filesystem is snapshot-consistent"
