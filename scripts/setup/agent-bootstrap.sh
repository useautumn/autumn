#!/usr/bin/env bash
set -euo pipefail

log() { echo "[agent-bootstrap] $*"; }

# --- 1. postgresql-16 and redis-server via apt ---
APT_NEEDED=()
command -v pg_ctlcluster >/dev/null 2>&1 || APT_NEEDED+=(postgresql-16)
command -v redis-server  >/dev/null 2>&1 || APT_NEEDED+=(redis-server)

if [ ${#APT_NEEDED[@]} -gt 0 ]; then
  log "Installing system packages: ${APT_NEEDED[*]}"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${APT_NEEDED[@]}"
fi

# --- 2. ClickHouse from official apt repo ---
if ! command -v clickhouse-server >/dev/null 2>&1; then
  log "Installing ClickHouse"
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' \
    | sudo gpg --dearmor -o /etc/apt/keyrings/clickhouse.gpg
  echo 'deb [signed-by=/etc/apt/keyrings/clickhouse.gpg] https://packages.clickhouse.com/deb stable main' \
    | sudo tee /etc/apt/sources.list.d/clickhouse.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::='--force-confnew' \
    clickhouse-server clickhouse-client
fi

# --- 3. Java runtime (required for ElasticMQ) ---
if ! command -v java >/dev/null 2>&1; then
  log "Installing Java (required for ElasticMQ)"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq default-jre-headless
fi

# --- 4. ElasticMQ jar (local SQS-compatible queue, no Docker) ---
ELASTICMQ_VERSION="1.6.11"
ELASTICMQ_JAR="/opt/elasticmq/elasticmq.jar"
if [ ! -f "$ELASTICMQ_JAR" ]; then
  log "Downloading ElasticMQ $ELASTICMQ_VERSION"
  sudo mkdir -p /opt/elasticmq
  sudo curl -fsSL -o "$ELASTICMQ_JAR" \
    "https://s3-eu-west-1.amazonaws.com/softwaremill-public/elasticmq-server-${ELASTICMQ_VERSION}.jar"
fi

# ElasticMQ config: single FIFO queue 'autumn.fifo'
ELASTICMQ_CONF="/opt/elasticmq/elasticmq.conf"
if [ ! -f "$ELASTICMQ_CONF" ]; then
  sudo tee "$ELASTICMQ_CONF" >/dev/null <<'EOF'
include classpath("application.conf")
node-address {
  protocol = http
  host = "localhost"
  port = 9324
  context-path = ""
}
rest-sqs {
  enabled = true
  bind-port = 9324
  bind-hostname = "0.0.0.0"
  sqs-limits = strict
}
queues {
  "autumn.fifo" {
    defaultVisibilityTimeout = 30 seconds
    receiveMessageWait = 0 seconds
    fifo = true
    contentBasedDeduplication = true
  }
}
EOF
fi

# --- 5. Bun workspace install ---
if [ ! -d node_modules ]; then
  log "Installing workspace dependencies"
  bun install --frozen-lockfile
fi

log "Bootstrap complete. Run: bun dev:agent"
