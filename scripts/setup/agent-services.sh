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
  for i in $(seq 1 30); do
    curl -sf -o /dev/null 'http://localhost:9324/?Action=ListQueues&Version=2012-11-05' && break
    sleep 0.5
  done
fi

# --- 3. Ensure Postgres DB exists ---
DB_NAME="autumn"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null \
  | grep -q 1 || sudo -u postgres createdb "$DB_NAME"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true

# --- 4. Write env files (no-op if server/.env already exists) ---
bun scripts/setup/writeAgentEnv.ts

# --- 5. DB migrations ---
log "Running migrations"
bun db:generate >/dev/null 2>&1 || true
bun db:migrate

log "All services ready"
