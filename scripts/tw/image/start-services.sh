#!/usr/bin/env bash
#
# start-services.sh — bring up the µVM's localhost daemons (plan §5, §5a, §4c).
#
# Starts (in background, idempotent): PostgreSQL 18 (pg_ctl), Dragonfly (:6380 —
# :6379 belongs to Tinybird Local's Redis), elasticmq-native (:9324), Tinybird
# Local (supervisord stack, API on :7181, present on the Modal image only), and
# optionally ClickHouse (:8123 — mutually exclusive with Tinybird Local, whose
# own ClickHouse owns that port). All bind to localhost; only the Autumn server
# port is ever exposed.
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
GOAWS_DIR="${GOAWS_DIR:-$TW_PREFIX/goaws}"
GOAWS_CONF="${GOAWS_CONF:-$GOAWS_DIR/goaws.yaml}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"
GOAWS_BIN="${GOAWS_BIN:-$BIN_DIR/goaws}"
LOG_DIR="${TW_LOG_DIR:-$TW_PREFIX/logs}"

PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6380}"
ELASTICMQ_PORT="${ELASTICMQ_PORT:-9324}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
START_CLICKHOUSE="${TW_START_CLICKHOUSE:-0}"
TINYBIRD_PORT="${TINYBIRD_PORT:-7181}"
# Tinybird Local lives at /app/tinybird-local on the Modal base image only;
# "auto" starts it iff that layout exists (no-op on the Vercel µVM).
START_TINYBIRD="${TW_START_TINYBIRD:-auto}"
TINYBIRD_MARKER="/app/tinybird-local"
SUPERVISORD_CONF="/etc/supervisor/supervisord.conf"

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

# PostgreSQL refuses to run as root. On the Vercel µVM we're already a non-root
# user, but Modal runs sandboxes as root — so when EUID=0, run pg_ctl as the
# `postgres` user that owns PGDATA (forwarding PATH so the PG bins resolve). This
# is a no-op (`"$@"` directly) on the non-root Vercel path.
run_pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- env "PATH=$PATH" "$@"
  else
    "$@"
  fi
}

wait_for() {
  local label="$1" probe="$2" tries="${3:-60}" logfile="${4:-}"
  for _ in $(seq 1 "$tries"); do
    if eval "$probe" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "[tw-start-services] ERROR: $label did not become ready" >&2
  if [ -n "$logfile" ] && [ -f "$logfile" ]; then
    echo "--- last 40 lines of $logfile ---" >&2
    tail -n 40 "$logfile" >&2
  fi
  exit 1
}

# ---------------------------------------------------------------------------
# Services start in PARALLEL: launch all three daemons up-front (non-blocking),
# then wait for each below. Because the daemons are already coming up, the
# readiness polls overlap — total ≈ the slowest single service, not their sum.
# ---------------------------------------------------------------------------

# 1. PostgreSQL — pg_ctl against the baked data dir. No `-w` so the launch is
#    non-blocking (the wait_for below is the readiness gate). No migration here.
if run_pg pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  log "PG already running"
else
  [ -s "$PGDATA/PG_VERSION" ] || die "PGDATA $PGDATA not initialized (run build-base.sh)"
  log "Starting PostgreSQL (pg_ctl) on :$PG_PORT"
  run_pg pg_ctl -D "$PGDATA" -l "$LOG_DIR/pg.log" -o "-p $PG_PORT" start
fi

# 2. Dragonfly — Redis-protocol cache on :6380. --dir is the snapshot path so the
#    clean-stop SAVE in stop-services.sh persists to disk for the fork.
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

# 3. goaws (native Go SQS, :9324) — replaces elasticmq (see build-base.sh §4).
#    Single static Go binary; ~100ms start; FIFO + explicit-dedup. Same port +
#    account + queues as the old elasticmq, so the queue URLs are unchanged.
#    `GET /` returns HTTP 400 (no Action), but a successful connection means it's
#    bound and serving — sufficient readiness probe (no `-f`).
goaws_ready_probe="curl -s -o /dev/null http://localhost:$ELASTICMQ_PORT/"
if eval "$goaws_ready_probe" >/dev/null 2>&1; then
  log "goaws already running"
else
  [ -x "$GOAWS_BIN" ] || die "goaws binary missing at $GOAWS_BIN (run build-base.sh)"
  log "Starting goaws (native SQS) on :$ELASTICMQ_PORT"
  nohup "$GOAWS_BIN" -config "$GOAWS_CONF" >"$LOG_DIR/goaws.log" 2>&1 &
  disown || true
fi

# 4. Tinybird Local — the whole stack (ClickHouse, Redis :6379, nginx :7181,
#    tinybird_server, HFI events API) is supervisord-managed on the Modal image.
#    /tokens goes 200 BEFORE the API backend serves (still 502 then), so the
#    probe also requires a non-5xx from /v0/datasources (401/403 = backend up).
tinybird_api_probe="curl -s -o /dev/null -w '%{http_code}' http://localhost:$TINYBIRD_PORT/v0/datasources | grep -qE '^[234]'"
tinybird_ready_probe="curl -sf -o /dev/null http://localhost:$TINYBIRD_PORT/tokens && $tinybird_api_probe"
tinybird_wanted=0
if [ "$START_TINYBIRD" = "1" ]; then
  tinybird_wanted=1
elif [ "$START_TINYBIRD" = "auto" ] && [ -d "$TINYBIRD_MARKER" ] && command -v supervisord >/dev/null 2>&1; then
  tinybird_wanted=1
fi
if [ "$tinybird_wanted" = "1" ]; then
  if eval "$tinybird_ready_probe" >/dev/null 2>&1; then
    log "Tinybird Local already running"
  else
    [ -f "$SUPERVISORD_CONF" ] || die "supervisord config missing at $SUPERVISORD_CONF"
    log "Starting Tinybird Local (supervisord) on :$TINYBIRD_PORT"
    nohup supervisord -c "$SUPERVISORD_CONF" >"$LOG_DIR/tinybird-supervisord.log" 2>&1 &
    disown || true
  fi
else
  log "Skipping Tinybird Local (not present on this image)"
fi

# Wait for all (started above) concurrently — readiness overlaps.
wait_for "PostgreSQL" "pg_isready -h localhost -p $PG_PORT" 60 "$LOG_DIR/pg.log"
wait_for "Dragonfly" "redis-cli -p $DRAGONFLY_PORT PING" 60 "$LOG_DIR/dragonfly.log"
wait_for "goaws" "$goaws_ready_probe" 120 "$LOG_DIR/goaws.log"
if [ "$tinybird_wanted" = "1" ]; then
  # First-ever boot (warm layer) runs the workspace setup — allow up to 3 min.
  wait_for "Tinybird Local" "$tinybird_ready_probe" 720 "/var/log/tinybird-local-setup.log"
fi

# ---------------------------------------------------------------------------
# 5. Standalone ClickHouse (optional; unavailable when Tinybird Local runs —
#    Tinybird's own ClickHouse owns :8123).
# ---------------------------------------------------------------------------
if [ "$START_CLICKHOUSE" = "1" ] && [ "$tinybird_wanted" = "1" ]; then
  die "TW_START_CLICKHOUSE=1 conflicts with Tinybird Local (both bind :8123)"
fi
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

log "All services ready (pg:$PG_PORT dragonfly:$DRAGONFLY_PORT goaws:$ELASTICMQ_PORT tinybird:$([ "$tinybird_wanted" = "1" ] && echo "$TINYBIRD_PORT" || echo off))"
