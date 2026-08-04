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
GOAWS_DIR="${GOAWS_DIR:-$TW_PREFIX/goaws}"
GOAWS_CONF="${GOAWS_CONF:-$GOAWS_DIR/goaws.yaml}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"
GOAWS_BIN="${GOAWS_BIN:-$BIN_DIR/goaws}"
LOG_DIR="${TW_LOG_DIR:-$TW_PREFIX/logs}"

PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6379}"
ELASTICMQ_PORT="${ELASTICMQ_PORT:-9324}"
DYNAMODB_PORT="${DYNAMODB_PORT:-8000}"
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

# 2. Dragonfly — Redis-protocol cache on :6379. --dir is the snapshot path so the
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

# 3b. dynoxide (native DynamoDB emulator, :8000) — backs the idempotency-key
#     store. Like goaws, a bare GET means it's bound and serving.
#
# Self-heal: base/warm snapshots built BEFORE dynoxide shipped don't have the
# binary, but a worker may still fast-forward the repo onto this script (e.g.
# a stale warm parent whose refresh failed). The binary is a ~3MB static musl
# download, so fetch it at boot instead of failing the whole worker.
ensure_dynoxide() {
  [ -x "$BIN_DIR/dynoxide" ] && return 0
  DYNOXIDE_VERSION="${DYNOXIDE_VERSION:-v0.13.0}"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) DX_TARGET="x86_64-unknown-linux-musl" ;;
    aarch64 | arm64) DX_TARGET="aarch64-unknown-linux-musl" ;;
    *) log "WARN: unsupported arch for dynoxide: $ARCH"; return 1 ;;
  esac
  log "dynoxide missing from base image — fetching $DYNOXIDE_VERSION ($ARCH)"
  TMP_DX="$(mktemp -d)"
  if ! curl -fsSL -o "$TMP_DX/dynoxide.tar.gz" \
    "https://github.com/nubo-db/dynoxide/releases/download/${DYNOXIDE_VERSION}/dynoxide-${DX_TARGET}.tar.gz"; then
    rm -rf "$TMP_DX"
    log "WARN: dynoxide download failed"
    return 1
  fi
  tar -xzf "$TMP_DX/dynoxide.tar.gz" -C "$TMP_DX"
  DX_EXTRACTED="$(find "$TMP_DX" -type f -name 'dynoxide*' ! -name '*.tar.gz' | head -n1)"
  if [ -z "$DX_EXTRACTED" ]; then
    rm -rf "$TMP_DX"
    log "WARN: dynoxide binary not found in archive"
    return 1
  fi
  install -m 0755 "$DX_EXTRACTED" "$BIN_DIR/dynoxide"
  rm -rf "$TMP_DX"
}

dynoxide_ready_probe="curl -s -o /dev/null http://localhost:$DYNAMODB_PORT/"
if eval "$dynoxide_ready_probe" >/dev/null 2>&1; then
  log "dynoxide already running"
elif ensure_dynoxide; then
  log "Starting dynoxide (native DynamoDB) on :$DYNAMODB_PORT"
  nohup "$BIN_DIR/dynoxide" --port "$DYNAMODB_PORT" >"$LOG_DIR/dynoxide.log" 2>&1 &
  disown || true
else
  # Degrade rather than kill the worker: the app fails open on an
  # unreachable DynamoDB, and dynamo-gated tests skip without the endpoint.
  log "WARN: dynoxide unavailable — continuing without the DynamoDB emulator"
  DYNOXIDE_DISABLED=1
fi

# Wait for all four (started above) concurrently — readiness overlaps.
wait_for "PostgreSQL" "pg_isready -h localhost -p $PG_PORT" 60 "$LOG_DIR/pg.log"
wait_for "Dragonfly" "redis-cli -p $DRAGONFLY_PORT PING" 60 "$LOG_DIR/dragonfly.log"
wait_for "goaws" "$goaws_ready_probe" 120 "$LOG_DIR/goaws.log"
if [ "${DYNOXIDE_DISABLED:-0}" != "1" ]; then
  wait_for "dynoxide" "$dynoxide_ready_probe" 60 "$LOG_DIR/dynoxide.log"
fi

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

log "All services ready (pg:$PG_PORT dragonfly:$DRAGONFLY_PORT goaws:$ELASTICMQ_PORT dynoxide:$DYNAMODB_PORT)"
