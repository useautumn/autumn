#!/usr/bin/env bash
#
# start-services.sh — bring up the µVM's localhost daemons (plan §5, §5a, §4c).
#
# Starts (in background, idempotent): PostgreSQL 18 (pg_ctl), Dragonfly (:6379),
# elasticmq-native (:9324), and optionally ClickHouse (:8123). All bind to
# localhost; only the Autumn server port is ever exposed.
#
# Used twice:
#   1. during the BASE build (build-base.sh starts PG itself; this is for warm).
#   2. on every WORKER boot — services come up against the baked, migrated data
#      dir (schema already present, NO re-migration).
#
# Idempotent: a PING/probe gate per service means re-invocation is a no-op.
set -euo pipefail

log() { echo "[tw-start-services] $*"; }
die() { echo "[tw-start-services] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
PGDATA="${PGDATA:-$TW_PREFIX/pgdata}"
DRAGONFLY_DIR="${DRAGONFLY_DIR:-$TW_PREFIX/dragonfly}"
ELASTICMQ_DIR="${ELASTICMQ_DIR:-$TW_PREFIX/elasticmq}"
ELASTICMQ_BIN="${ELASTICMQ_BIN:-$ELASTICMQ_DIR/elasticmq-native-server}"
ELASTICMQ_JAR="${ELASTICMQ_JAR:-$ELASTICMQ_DIR/elasticmq.jar}"
ELASTICMQ_CONF="${ELASTICMQ_CONF:-$ELASTICMQ_DIR/elasticmq.conf}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"
LOG_DIR="${TW_LOG_DIR:-$TW_PREFIX/logs}"

PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6379}"
ELASTICMQ_PORT="${ELASTICMQ_PORT:-9324}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
START_CLICKHOUSE="${TW_START_CLICKHOUSE:-0}"

mkdir -p "$LOG_DIR" "$DRAGONFLY_DIR"

# Find PG binaries (same probe as build-base.sh).
PG_BINDIR=""
for candidate in /usr/pgsql-18/bin /usr/lib/postgresql/18/bin /usr/bin "$BIN_DIR"; do
  if [ -x "$candidate/pg_ctl" ]; then
    PG_BINDIR="$candidate"
    break
  fi
done
[ -n "$PG_BINDIR" ] || die "could not locate pg_ctl"
export PATH="$PG_BINDIR:$BIN_DIR:$HOME/.bun/bin:$PATH"

wait_for() {
  local label="$1" probe="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if eval "$probe" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  die "$label did not become ready"
}

# ---------------------------------------------------------------------------
# 1. PostgreSQL — pg_ctl against the baked data dir. No migration here.
# ---------------------------------------------------------------------------
if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  log "PG already running"
else
  [ -s "$PGDATA/PG_VERSION" ] || die "PGDATA $PGDATA not initialized (run build-base.sh)"
  log "Starting PostgreSQL (pg_ctl) on :$PG_PORT"
  pg_ctl -D "$PGDATA" -l "$LOG_DIR/pg.log" -w -o "-p $PG_PORT" start
fi
wait_for "PostgreSQL" "pg_isready -h localhost -p $PG_PORT"

# ---------------------------------------------------------------------------
# 2. Dragonfly — Redis-protocol cache on :6379. --dir is the snapshot path so
#    the clean-stop SAVE in stop-services.sh persists to disk for the fork.
# ---------------------------------------------------------------------------
if redis-cli -p "$DRAGONFLY_PORT" PING >/dev/null 2>&1; then
  log "Dragonfly already running"
else
  [ -x "$BIN_DIR/dragonfly" ] || die "dragonfly binary missing (run build-base.sh)"
  log "Starting Dragonfly on :$DRAGONFLY_PORT (--dir $DRAGONFLY_DIR)"
  nohup "$BIN_DIR/dragonfly" \
    --port "$DRAGONFLY_PORT" \
    --bind 127.0.0.1 \
    --dir "$DRAGONFLY_DIR" \
    --dbfilename dump \
    >"$LOG_DIR/dragonfly.log" 2>&1 &
  disown || true
fi
wait_for "Dragonfly" "redis-cli -p $DRAGONFLY_PORT PING"

# ---------------------------------------------------------------------------
# 3. elasticmq-native (:9324). Prefer the GraalVM native binary; fall back to
#    the JVM jar if only that was baked (build-base.sh fallback path).
# ---------------------------------------------------------------------------
elasticmq_ready_probe="curl -sf -o /dev/null 'http://localhost:$ELASTICMQ_PORT/?Action=ListQueues&Version=2012-11-05'"
if eval "$elasticmq_ready_probe" >/dev/null 2>&1; then
  log "elasticmq already running"
else
  if [ -x "$ELASTICMQ_BIN" ]; then
    log "Starting elasticmq-native on :$ELASTICMQ_PORT"
    nohup "$ELASTICMQ_BIN" \
      "-Dconfig.file=$ELASTICMQ_CONF" \
      >"$LOG_DIR/elasticmq.log" 2>&1 &
    disown || true
  elif [ -f "$ELASTICMQ_JAR" ]; then
    command -v java >/dev/null 2>&1 || die "elasticmq jar fallback needs java"
    log "Starting elasticmq (JVM jar fallback) on :$ELASTICMQ_PORT"
    nohup java -Dconfig.file="$ELASTICMQ_CONF" -jar "$ELASTICMQ_JAR" \
      >"$LOG_DIR/elasticmq.log" 2>&1 &
    disown || true
  else
    die "no elasticmq binary or jar found (run build-base.sh)"
  fi
fi
wait_for "elasticmq" "$elasticmq_ready_probe"

# ---------------------------------------------------------------------------
# 4. ClickHouse (optional).
# ---------------------------------------------------------------------------
if [ "$START_CLICKHOUSE" = "1" ]; then
  if curl -sf -o /dev/null "http://localhost:$CLICKHOUSE_PORT/ping" 2>/dev/null; then
    log "ClickHouse already running"
  else
    CH_BIN="$BIN_DIR/clickhouse"
    [ -x "$CH_BIN" ] || CH_BIN="$(command -v clickhouse || true)"
    [ -n "$CH_BIN" ] && [ -x "$CH_BIN" ] || die "clickhouse binary missing (TW_INSTALL_CLICKHOUSE=1 at base build)"
    log "Starting ClickHouse on :$CLICKHOUSE_PORT"
    nohup "$CH_BIN" server \
      -- --http_port="$CLICKHOUSE_PORT" --listen_host=127.0.0.1 \
      >"$LOG_DIR/clickhouse.log" 2>&1 &
    disown || true
  fi
  wait_for "ClickHouse" "curl -sf -o /dev/null http://localhost:$CLICKHOUSE_PORT/ping"
else
  log "Skipping ClickHouse (set TW_START_CLICKHOUSE=1 to start it)"
fi

log "All services ready (pg:$PG_PORT dragonfly:$DRAGONFLY_PORT elasticmq:$ELASTICMQ_PORT)"
