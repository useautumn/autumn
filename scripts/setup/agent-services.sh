#!/usr/bin/env bash
set -euo pipefail

log() { echo "[agent-services] $*"; }

OS="$(uname -s)"

# Make sure `tb` installed by bootstrap is on PATH
export PATH="$HOME/.local/bin:$PATH"

# =============================================================
# 1. Start postgres + redis (OS-specific)
# =============================================================
log "Starting system services"

if [ "$OS" = "Darwin" ]; then
  brew services start postgresql@18  >/dev/null 2>&1 || true
  brew services start redis-stack    >/dev/null 2>&1 || true
else
  sudo service postgresql            start >/dev/null 2>&1 || true

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
# 3. Tinybird Local (runs in Docker, started/managed by `tb local`)
# =============================================================
if ! command -v tb >/dev/null 2>&1; then
  echo "[agent-services] ERROR: 'tb' CLI not found. Run 'bun agent:bootstrap' first." >&2
  exit 1
fi

# Ensure Docker daemon is reachable. On Linux try systemctl first, then
# fall back to SysV service. On macOS the user must have Docker Desktop /
# OrbStack / colima running already.
if ! docker info >/dev/null 2>&1; then
  if [ "$OS" = "Linux" ]; then
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl start docker >/dev/null 2>&1 || true
    else
      sudo service docker start >/dev/null 2>&1 || true
    fi
    sleep 2
  fi
fi
if ! docker info >/dev/null 2>&1; then
  echo "[agent-services] ERROR: Docker daemon is not reachable." >&2
  if [ "$OS" = "Darwin" ]; then
    echo "  Start Docker Desktop, OrbStack, or colima and retry." >&2
  else
    echo "  Start the Docker daemon (e.g. 'sudo systemctl start docker') and retry." >&2
  fi
  exit 1
fi

# Start Tinybird Local. Three cases:
#   - container exists + running:  no-op (HTTP poll below confirms readiness)
#   - container exists + stopped:  `docker start tinybird-local` (fast path, ~15s to healthy)
#   - container doesn't exist:     `tb local start` to create it (first-run only)
#
# We avoid `tb local start` when the container already exists because the tb
# CLI tails container logs indefinitely when it finds a healthy container.
export TB_VERSION_WARNING=0
TB_START_LOG="${HOME}/.autumn-agent/logs/tb-local-start.log"
mkdir -p "$(dirname "$TB_START_LOG")"
# NOTE: `docker inspect -f '{{.State.Status}}' missing` emits a bare newline
# to stdout even with stderr suppressed, so do the existence check first.
if docker inspect tinybird-local >/dev/null 2>&1; then
  TB_CONTAINER_STATE="$(docker inspect -f '{{.State.Status}}' tinybird-local)"
else
  TB_CONTAINER_STATE="absent"
fi
case "$TB_CONTAINER_STATE" in
  running)
    ;;
  absent)
    log "Creating Tinybird Local container via 'tb local start' (first run may take ~2m)"
    # tb local start tails logs forever even on create — background it and
    # gate readiness on HTTP. Killing the tb CLI doesn't kill the container.
    nohup tb local start >"$TB_START_LOG" 2>&1 &
    TB_START_PID=$!
    disown || true
    ;;
  *)
    log "Starting existing Tinybird Local container ('$TB_CONTAINER_STATE' -> running)"
    docker start tinybird-local >/dev/null
    ;;
esac

# Readiness poll. HTTP :7181 comes up before the internal services
# (clickhouse, redis, events) finish starting — `tb deploy` will refuse
# to run until the container's docker healthcheck reports "healthy".
TB_READY=0
for i in $(seq 1 240); do
  HEALTH="$(docker inspect -f '{{.State.Health.Status}}' tinybird-local 2>/dev/null || echo 'none')"
  if [ "$HEALTH" = "healthy" ] && curl -sf -o /dev/null http://localhost:7181/; then
    TB_READY=1
    break
  fi
  sleep 1
done
# Reap the backgrounded tb CLI if we spawned one.
if [ -n "${TB_START_PID:-}" ]; then
  kill -TERM "$TB_START_PID" 2>/dev/null || true
  wait "$TB_START_PID" 2>/dev/null || true
fi
if [ "$TB_READY" -eq 0 ]; then
  echo "[agent-services] ERROR: Tinybird Local API (:7181) did not become ready after 240s." >&2
  [ -f "$TB_START_LOG" ] && { echo "  Tail of $TB_START_LOG:" >&2; tail -30 "$TB_START_LOG" >&2 || true; }
  exit 1
fi

# =============================================================
# 4. Stage + deploy Tinybird project into local workspace
#
# `tb deploy` walks the current directory tree and registers every
# datasource/pipe/materialization/connection it finds. The repo's
# connections/ and copies/ files reference cloud-only secrets
# (PG_USERNAME, S3 role ARNs) that don't make sense locally, so
# we stage a subset of the project into a per-agent build dir and
# deploy from there.
# =============================================================
TB_STAGE_DIR="${HOME}/.autumn-agent/tb-local"
mkdir -p "$TB_STAGE_DIR"
log "Staging Tinybird project for local deploy"
rsync -a --delete \
  --exclude='connections' \
  --exclude='copies' \
  --exclude='scripts' \
  server/tinybird/ "$TB_STAGE_DIR/"

log "Deploying datasources + pipes to Tinybird Local"
(
  cd "$TB_STAGE_DIR"
  tb --local deploy >/tmp/tb-deploy.log 2>&1 || {
    echo "[agent-services] ERROR: tb deploy failed. Tail of /tmp/tb-deploy.log:" >&2
    tail -30 /tmp/tb-deploy.log >&2
    exit 1
  }
)

# =============================================================
# 5. Extract TINYBIRD_* env vars from the local workspace
# =============================================================
log "Reading Tinybird Local credentials"
TB_INFO_JSON="$(cd "$TB_STAGE_DIR" && tb --output json --local info)"
TINYBIRD_TOKEN="$(echo "$TB_INFO_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["local"]["token"])')"
TINYBIRD_API_URL="$(echo "$TB_INFO_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["local"]["api"])')"
TINYBIRD_CLICKHOUSE_URL="$(echo "$TB_INFO_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["local"]["clickhouse"])')"
export TINYBIRD_TOKEN TINYBIRD_API_URL TINYBIRD_CLICKHOUSE_URL

# =============================================================
# 6. Ensure Postgres DB + role + pg_trgm
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
# 7. Write env files (reads TINYBIRD_* from process.env; always
#    upserts them into server/.env so token stays fresh across runs)
# =============================================================
bun scripts/setup/writeAgentEnv.ts

# =============================================================
# 8. DB migrations
# =============================================================
log "Running migrations"
bun db:generate >/dev/null 2>&1 || true
bun db:migrate

log "All services ready"
