#!/usr/bin/env bash
set -euo pipefail

log() { echo "[agent-services] $*"; }

OS="$(uname -s)"

# =============================================================
# 1. Start postgres + redis + clickhouse (OS-specific)
# =============================================================
log "Starting system services"

if [ "$OS" = "Darwin" ]; then
  brew services start postgresql@18  >/dev/null 2>&1 || true
  brew services start redis-stack    >/dev/null 2>&1 || true
  brew services start clickhouse     >/dev/null 2>&1 || true
else
  sudo service postgresql            start >/dev/null 2>&1 || true
  sudo service clickhouse-server     start >/dev/null 2>&1 || true

  # redis-stack-server ships a systemd unit but no SysV init script.
  # Try `service` first (works when systemd is the init), then fall back
  # to invoking the binary directly (works in containers without systemd).
  if ! redis-cli -p 6379 PING >/dev/null 2>&1; then
    if ! sudo service redis-stack-server start >/dev/null 2>&1; then
      REDIS_LOG_DIR="${HOME}/.autumn-agent/logs"
      mkdir -p "$REDIS_LOG_DIR"
      log "Starting redis-stack-server manually"
      nohup /opt/redis-stack/bin/redis-stack-server \
        >"$REDIS_LOG_DIR/redis-stack.log" 2>&1 &
      disown || true
      for i in $(seq 1 30); do
        redis-cli -p 6379 PING >/dev/null 2>&1 && break
        sleep 0.2
      done
    fi
  fi
fi

# =============================================================
# 2. ElasticMQ (cross-platform, per-user dir)
# =============================================================
ELASTICMQ_DIR="${HOME}/.autumn-agent/elasticmq"
ELASTICMQ_JAR="${ELASTICMQ_DIR}/elasticmq.jar"
ELASTICMQ_CONF="${ELASTICMQ_DIR}/elasticmq.conf"
ELASTICMQ_LOG_DIR="${HOME}/.autumn-agent/logs"
mkdir -p "$ELASTICMQ_LOG_DIR"

if ! pgrep -f 'elasticmq.*\.jar' >/dev/null 2>&1; then
  log "Starting ElasticMQ on :9324"
  nohup java \
    -Dconfig.file="$ELASTICMQ_CONF" \
    -jar "$ELASTICMQ_JAR" \
    >"$ELASTICMQ_LOG_DIR/elasticmq.log" 2>&1 &
  disown || true
  log "Waiting for ElasticMQ to be ready"
  ELASTICMQ_READY=0
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null 'http://localhost:9324/?Action=ListQueues&Version=2012-11-05'; then
      ELASTICMQ_READY=1
      break
    fi
    sleep 0.5
  done
  if [ "$ELASTICMQ_READY" -eq 0 ]; then
    echo "[agent-services] ERROR: ElasticMQ did not become ready after 15s. Check $ELASTICMQ_LOG_DIR/elasticmq.log" >&2
    exit 1
  fi
fi

# =============================================================
# 3. Ensure Postgres DB + role + pg_trgm
# =============================================================
DB_NAME="autumn"

if [ "$OS" = "Darwin" ]; then
  # macOS: brew's postgres runs as the current user, no 'postgres' role by default
  psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null \
    | grep -q 1 || createdb "$DB_NAME"
  psql -d postgres -c "DO \$\$ BEGIN CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres'; EXCEPTION WHEN duplicate_object THEN ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres'; END \$\$;" >/dev/null 2>&1 || true
  psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true
else
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null \
    | grep -q 1 || sudo -u postgres createdb "$DB_NAME"
  sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true
  sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true
fi

# =============================================================
# 4. Write env files (no-op if server/.env already exists)
# =============================================================
bun scripts/setup/writeAgentEnv.ts

# =============================================================
# 5. DB migrations
# =============================================================
log "Running migrations"
bun db:generate >/dev/null 2>&1 || true
bun db:migrate

log "All services ready"
