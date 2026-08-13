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
# GoAWS (cross-platform, per-user dir, no sudo needed)
# =============================================================
GOAWS_VERSION="v0.5.4"
GOAWS_DIR="${HOME}/.autumn-agent/goaws"
GOAWS_BIN="${GOAWS_DIR}/goaws"
GOAWS_CONF="${GOAWS_DIR}/goaws.yaml"

mkdir -p "$GOAWS_DIR"

if [ ! -x "$GOAWS_BIN" ]; then
  case "$(uname -m)" in
    x86_64) GOAWS_ARCH="x86_64" ;;
    arm64 | aarch64) GOAWS_ARCH="arm64" ;;
    *) echo "[agent-bootstrap] ERROR: unsupported architecture for GoAWS: $(uname -m)" >&2; exit 1 ;;
  esac
  log "Downloading GoAWS $GOAWS_VERSION"
  GOAWS_TMP="$(mktemp -d)"
  curl -fsSL -o "$GOAWS_TMP/goaws.tar.gz" \
    "https://github.com/Admiral-Piett/goaws/releases/download/${GOAWS_VERSION}/goaws_${OS}_${GOAWS_ARCH}.tar.gz"
  tar -xzf "$GOAWS_TMP/goaws.tar.gz" -C "$GOAWS_TMP" goaws
  install -m 0755 "$GOAWS_TMP/goaws" "$GOAWS_BIN"
  rm -rf "$GOAWS_TMP"
fi

cp scripts/setup/goaws.yaml "$GOAWS_CONF"

# =============================================================
# Bun workspace install
# =============================================================
if [ ! -d node_modules ]; then
  log "Installing workspace dependencies"
  bun install --frozen-lockfile
fi

log "Bootstrap complete. Run: bun dev:agent"
