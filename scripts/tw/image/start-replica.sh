#!/usr/bin/env bash
#
# start-replica.sh — bring up a physical streaming (WAL) hot standby of the
# worker's own PostgreSQL on :$REPLICA_PORT. Run by boot.ts on the replica shard
# only, once start-services.sh has the primary up; exits 0 once the standby
# accepts read-only connections.
set -euo pipefail

log() { echo "[tw-start-replica] $*"; }
die() { echo "[tw-start-replica] ERROR: $*" >&2; exit 1; }

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"
LOG_DIR="${TW_LOG_DIR:-$TW_PREFIX/logs}"
PG_PORT="${PG_PORT:-5432}"
REPLICA_PORT="${REPLICA_PORT:-5433}"
REPLICA_PGDATA="${REPLICA_PGDATA:-$TW_PREFIX/pgdata-replica}"

PG_BINDIR=""
for candidate in /usr/pgsql-18/bin /usr/lib/postgresql/18/bin /usr/bin "$BIN_DIR"; do
  if [ -x "$candidate/pg_basebackup" ] && [ -x "$candidate/pg_ctl" ]; then
    PG_BINDIR="$candidate"
    break
  fi
done
[ -n "$PG_BINDIR" ] || die "could not locate pg_basebackup + pg_ctl"
export PATH="$PG_BINDIR:$PATH"

# Same rule as start-services.sh: PostgreSQL refuses root, Modal sandboxes run as root.
run_pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- env "PATH=$PATH" "$@"
  else
    "$@"
  fi
}

if run_pg pg_ctl -D "$REPLICA_PGDATA" status >/dev/null 2>&1; then
  log "standby already running on :$REPLICA_PORT"
  exit 0
fi

rm -rf "$REPLICA_PGDATA"
mkdir -p "$REPLICA_PGDATA" "$LOG_DIR"
if [ "$(id -u)" = "0" ]; then
  chown postgres:postgres "$REPLICA_PGDATA"
  chown postgres:postgres "$LOG_DIR"
fi
chmod 700 "$REPLICA_PGDATA"

# -R writes standby.signal + primary_conninfo; fast checkpoint skips the spread-checkpoint wait.
log "pg_basebackup from :$PG_PORT into $REPLICA_PGDATA"
run_pg pg_basebackup -h localhost -p "$PG_PORT" -U postgres -D "$REPLICA_PGDATA" \
  -X stream -R --checkpoint=fast --no-sync --no-manifest

{
  echo "port = $REPLICA_PORT"
  echo "hot_standby = on"
} >>"$REPLICA_PGDATA/postgresql.auto.conf"

# -w returns once a hot standby is consistent and accepting connections.
log "Starting standby (pg_ctl) on :$REPLICA_PORT"
run_pg pg_ctl -D "$REPLICA_PGDATA" -l "$LOG_DIR/pg-replica.log" -w -t 60 start \
  || { tail -n 40 "$LOG_DIR/pg-replica.log" >&2 || true; die "standby failed to start"; }

in_recovery="$(psql -h localhost -p "$REPLICA_PORT" -U postgres -d autumn -tAc 'SELECT pg_is_in_recovery()')"
[ "$in_recovery" = "t" ] || die "server on :$REPLICA_PORT is not a standby (pg_is_in_recovery=$in_recovery)"

for _ in $(seq 1 120); do
  streaming="$(psql -h localhost -p "$PG_PORT" -U postgres -d postgres -tAc \
    "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming'")"
  if [ "$streaming" -ge 1 ]; then
    log "standby streaming on :$REPLICA_PORT"
    exit 0
  fi
  sleep 0.25
done
tail -n 40 "$LOG_DIR/pg-replica.log" >&2 || true
die "standby on :$REPLICA_PORT never reached state=streaming"
