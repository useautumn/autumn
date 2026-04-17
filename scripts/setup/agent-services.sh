#!/usr/bin/env bash
set -euo pipefail

log() { echo "[agent-services] $*"; }

# --- 1. Start postgresql, redis, clickhouse ---
log "Starting system services"
sudo service postgresql start    >/dev/null 2>&1 || true
sudo service redis-server start  >/dev/null 2>&1 || true
sudo service clickhouse-server start >/dev/null 2>&1 || true

# --- 2. ElasticMQ ---
if ! pgrep -f 'elasticmq.*\.jar' >/dev/null 2>&1; then
  log "Starting ElasticMQ on :9324"
  sudo mkdir -p /var/log/autumn && sudo chmod 0777 /var/log/autumn
  nohup java \
    -Dconfig.file=/opt/elasticmq/elasticmq.conf \
    -jar /opt/elasticmq/elasticmq.jar \
    >/var/log/autumn/elasticmq.log 2>&1 &
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
    echo "[agent-services] ERROR: ElasticMQ did not become ready after 15s. Check /var/log/autumn/elasticmq.log" >&2
    exit 1
  fi
fi

# --- 3. Google OAuth emulator ---
if ! pgrep -f 'emulate.*google' >/dev/null 2>&1; then
  log "Starting Google OAuth emulator on :4002"
  sudo mkdir -p /var/log/autumn && sudo chmod 0777 /var/log/autumn
  lsof -ti:4002 | xargs kill -9 2>/dev/null || true
  _GOOGLE_SEED_PORT="${AGENT_SERVER_PORT:-8080}"
  cat > /tmp/google-oauth-seed.yaml <<EOF
google:
  users:
    - email: testuser@example.com
      name: Test User
  oauth_clients:
    - client_id: my-client-id.apps.googleusercontent.com
      client_secret: GOCSPX-secret
      redirect_uris:
        - http://localhost:${_GOOGLE_SEED_PORT}/api/auth/callback/google
EOF
  nohup npx emulate --service google --seed /tmp/google-oauth-seed.yaml \
    >/var/log/autumn/google-oauth-emulator.log 2>&1 &
  disown || true
  log "Waiting for Google OAuth emulator to be ready"
  EMULATOR_READY=0
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://localhost:4002; then
      EMULATOR_READY=1
      break
    fi
    sleep 0.5
  done
  if [ "$EMULATOR_READY" -eq 0 ]; then
    echo "[agent-services] ERROR: Google OAuth emulator did not become ready after 15s. Check /var/log/autumn/google-oauth-emulator.log" >&2
    exit 1
  fi
fi

# --- 4. Ensure Postgres DB exists ---
DB_NAME="autumn"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null \
  | grep -q 1 || sudo -u postgres createdb "$DB_NAME"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true

# --- 5. Write env files (no-op if server/.env already exists) ---
bun scripts/setup/writeAgentEnv.ts

# --- 6. DB migrations ---
log "Running migrations"
bun db:generate >/dev/null 2>&1 || true
bun db:migrate

log "All services ready"
