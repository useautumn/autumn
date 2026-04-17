#!/usr/bin/env bash
set -euo pipefail

log() { echo "[agent-bootstrap] $*"; }

OS="$(uname -s)"

# =============================================================
# macOS (via Homebrew)
# =============================================================
if [ "$OS" = "Darwin" ]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "[agent-bootstrap] ERROR: Homebrew is required on macOS. Install from https://brew.sh" >&2
    exit 1
  fi

  BREW_NEEDED=()
  command -v psql             >/dev/null 2>&1 || BREW_NEEDED+=(postgresql@18)
  command -v redis-stack-server >/dev/null 2>&1 || BREW_NEEDED+=(redis-stack)
  command -v clickhouse       >/dev/null 2>&1 || BREW_NEEDED+=(clickhouse)
  command -v java             >/dev/null 2>&1 || BREW_NEEDED+=(openjdk)

  # redis-stack lives in the redis-stack tap
  if [[ " ${BREW_NEEDED[*]} " == *" redis-stack "* ]]; then
    brew tap redis-stack/redis-stack >/dev/null 2>&1 || true
  fi

  if [ ${#BREW_NEEDED[@]} -gt 0 ]; then
    log "Installing via brew: ${BREW_NEEDED[*]}"
    brew install "${BREW_NEEDED[@]}"
  fi

  # brew-installed postgresql@18 is keg-only; surface its binaries on PATH hint
  if ! command -v pg_ctl >/dev/null 2>&1; then
    log "postgresql@18 is installed but not on PATH; add it to your shell rc:"
    log "  export PATH=\"$(brew --prefix postgresql@18)/bin:\$PATH\""
  fi

  # brew openjdk needs a symlink into the default JDK directory
  if ! java -version >/dev/null 2>&1; then
    JDK_DST="/Library/Java/JavaVirtualMachines/openjdk.jdk"
    if [ ! -e "$JDK_DST" ]; then
      log "Linking openjdk for system Java detection (requires sudo)"
      sudo ln -sfn "$(brew --prefix openjdk)/libexec/openjdk.jdk" "$JDK_DST"
    fi
  fi

# =============================================================
# Ubuntu / Debian (via apt)
# =============================================================
else
  # Postgres 18 isn't in Ubuntu's default repos — add the official PGDG apt repo
  if ! command -v pg_ctlcluster >/dev/null 2>&1; then
    if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
      log "Adding official PostgreSQL apt repo (PGDG)"
      sudo mkdir -p /etc/apt/keyrings
      curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /tmp/pgdg.asc
      sudo gpg --batch --yes -o /etc/apt/keyrings/postgresql.gpg --dearmor /tmp/pgdg.asc
      rm -f /tmp/pgdg.asc
      echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
        | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
      sudo apt-get update -qq
    fi
  fi

  # Redis Stack (provides RedisJSON, required by Autumn's Lua scripts)
  # Redis Stack is published for jammy only; that package works cleanly on noble too.
  if ! command -v redis-stack-server >/dev/null 2>&1; then
    if [ ! -f /etc/apt/sources.list.d/redis.list ]; then
      log "Adding Redis Stack apt repo"
      sudo mkdir -p /etc/apt/keyrings
      curl -fsSL https://packages.redis.io/gpg -o /tmp/redis-stack.asc
      sudo gpg --batch --yes -o /etc/apt/keyrings/redis-archive-keyring.gpg --dearmor /tmp/redis-stack.asc
      rm -f /tmp/redis-stack.asc
      echo "deb [signed-by=/etc/apt/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb jammy main" \
        | sudo tee /etc/apt/sources.list.d/redis.list >/dev/null
      sudo apt-get update -qq
    fi
  fi

  APT_NEEDED=()
  command -v pg_ctlcluster       >/dev/null 2>&1 || APT_NEEDED+=(postgresql-18)
  command -v redis-stack-server  >/dev/null 2>&1 || APT_NEEDED+=(redis-stack-server)
  command -v java                >/dev/null 2>&1 || APT_NEEDED+=(default-jre-headless)

  if [ ${#APT_NEEDED[@]} -gt 0 ]; then
    log "Installing via apt: ${APT_NEEDED[*]}"
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${APT_NEEDED[@]}"
  fi

  if ! command -v clickhouse-server >/dev/null 2>&1; then
    log "Installing ClickHouse from official apt repo"
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' -o /tmp/clickhouse.asc
    sudo gpg --batch --yes -o /etc/apt/keyrings/clickhouse.gpg --dearmor /tmp/clickhouse.asc
    rm -f /tmp/clickhouse.asc
    echo 'deb [signed-by=/etc/apt/keyrings/clickhouse.gpg] https://packages.clickhouse.com/deb stable main' \
      | sudo tee /etc/apt/sources.list.d/clickhouse.list >/dev/null
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      -o Dpkg::Options::='--force-confnew' \
      clickhouse-server clickhouse-client
  fi
fi

# =============================================================
# ElasticMQ jar (cross-platform, per-user dir, no sudo needed)
# =============================================================
ELASTICMQ_VERSION="1.6.11"
ELASTICMQ_DIR="${HOME}/.autumn-agent/elasticmq"
ELASTICMQ_JAR="${ELASTICMQ_DIR}/elasticmq.jar"
ELASTICMQ_CONF="${ELASTICMQ_DIR}/elasticmq.conf"

mkdir -p "$ELASTICMQ_DIR"

if [ ! -f "$ELASTICMQ_JAR" ]; then
  log "Downloading ElasticMQ $ELASTICMQ_VERSION"
  curl -fsSL -o "$ELASTICMQ_JAR" \
    "https://s3-eu-west-1.amazonaws.com/softwaremill-public/elasticmq-server-${ELASTICMQ_VERSION}.jar"
fi

if [ ! -f "$ELASTICMQ_CONF" ]; then
  cat > "$ELASTICMQ_CONF" <<'EOF'
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

# =============================================================
# Bun workspace install
# =============================================================
if [ ! -d node_modules ]; then
  log "Installing workspace dependencies"
  bun install --frozen-lockfile
fi

log "Bootstrap complete. Run: bun dev:agent"
