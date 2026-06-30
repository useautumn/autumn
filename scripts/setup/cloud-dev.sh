#!/usr/bin/env bash
#
# cloud-dev.sh — one-shot "spin up everything + run the dev stack" for the
# Cursor Cloud VM.
#
# Unlike the legacy agent-bootstrap.sh / devAgent.sh / capy flows, this script
# uses the project's own tooling end-to-end:
#
#   - backing services come from the `dev-services` Docker compose
#     (docker/dev-services.compose.yml): Postgres 18, Redis Stack, Dragonfly
#   - the SQS queue is goaws (local, FIFO: autumn.fifo + autumn-track.fifo)
#   - the AI skills/rules/agents come from the `ai` submodule via `bun sync`
#   - the app dev stack is launched with `bun dw` (scripts/dw/index.ts)
#
# Neon is intentionally NOT used — worktree #1 runs against the local Docker
# Postgres. Everything here is idempotent and safe to re-run.
#
# Usage:
#   bash scripts/setup/cloud-dev.sh              # provision + run `bun dw` (foreground)
#   bash scripts/setup/cloud-dev.sh --services   # provision only, don't run the stack
#   bash scripts/setup/cloud-dev.sh --down       # release the ngrok tunnel + Stripe webhook
#
set -euo pipefail

log() { echo "[cloud-dev] $*"; }
die() { echo "[cloud-dev] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SERVICES_ONLY=0
[ "${1:-}" = "--services" ] && SERVICES_ONLY=1

# Teardown the public tunnel + Stripe webhook endpoint and exit. `bun dw teardown`
# refuses to act on the canonical worktree #1, so tunnel release lives here.
if [ "${1:-}" = "--down" ]; then
  bun scripts/setup/cloud-tunnel.ts down
  exit 0
fi

TUNNEL_LOG="${HOME}/.autumn-agent/logs/tunnel.log"
TUNNEL_STATE="${HOME}/.autumn-agent/tunnel-state.json"

COMPOSE_FILE="docker/dev-services.compose.yml"
COMPOSE_PROJECT="autumn-dev-services"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autumn"

AGENT_PREFIX="${HOME}/.autumn-agent"
GOAWS_BIN="${AGENT_PREFIX}/bin/goaws"
GOAWS_CONF="${AGENT_PREFIX}/goaws/goaws.yaml"
GOAWS_LOG="${AGENT_PREFIX}/logs/goaws.log"

# --- docker helper: prefer rootless group access, fall back to sudo ----------
DOCKER="docker"
docker_ok() { $DOCKER info >/dev/null 2>&1; }

ensure_docker() {
  if docker_ok; then return; fi
  if sudo -n docker info >/dev/null 2>&1; then DOCKER="sudo docker"; return; fi

  log "docker daemon not reachable — starting dockerd"
  sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    if sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"; break; fi
    sleep 1
  done
  docker_ok || $DOCKER info >/dev/null 2>&1 || die "dockerd did not become ready (see /tmp/dockerd.log)"
  DOCKER="sudo docker"
}

wait_for_tcp() {
  local port="$1" label="$2"
  for _ in $(seq 1 60); do
    (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null && { exec 3>&- 3<&-; return 0; }
    sleep 0.5
  done
  die "${label} did not become ready on :${port}"
}

# --- 1. backing services (Docker: Postgres + Redis Stack + Dragonfly) --------
start_dev_services() {
  ensure_docker
  log "starting dev-services containers (postgres, redis-stack, dragonfly)"
  # The ngrok profile needs an authtoken/Infisical, so we start only the three
  # data services explicitly rather than `bun dev:services up`.
  $DOCKER compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d \
    postgres redis-stack dragonfly
  wait_for_tcp 5432 "Postgres"
  wait_for_tcp 6379 "Redis Stack"
  wait_for_tcp 6380 "Dragonfly"
  # pg_trgm is required by the GIN trigram indexes in the migrations.
  log "ensuring pg_trgm extension"
  PGPASSWORD=postgres psql -h localhost -U postgres -d autumn \
    -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
}

# --- 2. goaws (local SQS) ----------------------------------------------------
install_goaws() {
  [ -x "$GOAWS_BIN" ] && return
  log "installing goaws (extracting from OCI image via crane)"
  mkdir -p "$(dirname "$GOAWS_BIN")"
  local arch cr_arch tmp goaws_path
  arch="$(uname -m)"
  case "$arch" in
    x86_64) cr_arch="x86_64" ;;
    aarch64 | arm64) cr_arch="arm64" ;;
    *) die "unsupported arch for goaws: $arch" ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/crane.tgz" \
    "https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_${cr_arch}.tar.gz"
  tar -xzf "$tmp/crane.tgz" -C "$tmp" crane
  "$tmp/crane" export docker.io/admiralpiett/goaws:v0.5.4 "$tmp/goaws-rootfs.tar"
  goaws_path="$(tar -tf "$tmp/goaws-rootfs.tar" | grep -iE '(^|/)goaws$' | head -n1)"
  [ -n "$goaws_path" ] || die "goaws binary not found in image"
  tar -xf "$tmp/goaws-rootfs.tar" -C "$tmp" "$goaws_path"
  install -m 0755 "$tmp/$goaws_path" "$GOAWS_BIN"
  rm -rf "$tmp"
}

write_goaws_conf() {
  mkdir -p "$(dirname "$GOAWS_CONF")"
  cat > "$GOAWS_CONF" <<'EOF'
Local:
  Host: localhost
  Scheme: http
  Port: 9324
  Region: us-east-1
  AccountId: "000000000000"
  LogToFile: false
  LogLevel: warn
  EnableDuplicates: true
  Queues:
    - Name: autumn.fifo
    - Name: autumn-track.fifo
EOF
}

start_goaws() {
  install_goaws
  write_goaws_conf
  mkdir -p "$(dirname "$GOAWS_LOG")"
  if curl -s -o /dev/null "http://localhost:9324/" 2>/dev/null; then
    log "goaws already running on :9324"
    return
  fi
  log "starting goaws on :9324 (autumn.fifo + autumn-track.fifo)"
  nohup "$GOAWS_BIN" -config "$GOAWS_CONF" >"$GOAWS_LOG" 2>&1 &
  disown || true
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://localhost:9324/" && return
    sleep 0.3
  done
  die "goaws did not become ready (see $GOAWS_LOG)"
}

# --- 3. deps + ai submodule sync (via `bun dw setup`) ------------------------
# `bun dw setup` runs `bun install`, inits the `ai` submodule, checks out its
# `main` branch, installs its deps and runs `bun sync` (the "ai sync" that
# writes AGENTS.md + .cursor/.claude skills). We invoke scripts/dw directly to
# bypass the Infisical wrapper baked into the `bun dw` npm alias.
sync_deps_and_ai() {
  log "running 'bun dw setup' (deps + ai submodule + bun sync)"
  bun scripts/dw/index.ts setup
}

# --- 4. server env + DB schema ----------------------------------------------
write_server_env() {
  if [ -f server/.env ]; then
    log "server/.env already exists — leaving as-is"
    return
  fi
  log "writing server/.env (local service URLs + generated secrets)"
  local secret iv pass
  secret="$(openssl rand -base64 64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
  iv="$(openssl rand -base64 16 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
  pass="$(openssl rand -base64 64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
  cat > server/.env <<EOF
# Generated by scripts/setup/cloud-dev.sh — delete + re-run to regenerate.
BETTER_AUTH_SECRET=${secret}
ENCRYPTION_IV=${iv}
ENCRYPTION_PASSWORD=${pass}

DATABASE_URL=${DATABASE_URL}
DATABASE_CRITICAL_URL=${DATABASE_URL}
CACHE_URL=redis://localhost:6379
CACHE_URL_US_EAST=redis://localhost:6379
REDIS_URL=redis://localhost:6379
CACHE_V2_DRAGONFLY_URL=redis://localhost:6380

SQS_QUEUE_URL_V2=http://localhost:9324/000000000000/autumn.fifo
TRACK_SQS_QUEUE_URL=http://localhost:9324/000000000000/autumn-track.fifo
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=x
AWS_SECRET_ACCESS_KEY=x

BETTER_AUTH_URL=http://localhost:8080
CLIENT_URL=http://localhost:3000
STRIPE_WEBHOOK_URL=http://localhost:8080

NODE_ENV=development
EOF
}

migrate_db() {
  log "applying migrations (bootstrap)"
  AUTUMN_DB_DIRECT=1 DATABASE_URL="$DATABASE_URL" bun db migrate --bootstrap
  log "loading balance DB functions"
  local sqldir="server/src/internal/balances/utils/sql"
  for f in deductFromRollovers deductFromMainBalance unwindFromLockReceipt \
           getTotalBalance deductFromAdditionalBalance \
           getAvailableOverageFromSpendLimit performDeduction \
           syncBalances syncBalancesV2 resetCusEnts; do
    PGPASSWORD=postgres psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$sqldir/$f.sql" >/dev/null
  done
}

# --- 5. public tunnel + Stripe webhooks --------------------------------------
# Cursor Cloud VMs have no inbound public URL, so Stripe can't reach localhost.
# If NGROK_AUTHTOKEN is set we open an ngrok tunnel to the server and (if a
# Stripe platform key is set) register the Connect webhook at the tunnel URL.
# This writes STRIPE_WEBHOOK_URL/STRIPE_WEBHOOK_SKIP_VERIFY (+ the fresh webhook
# signing secret) into server/.env *before* the server boots.
start_tunnel() {
  if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
    log "NGROK_AUTHTOKEN not set — skipping tunnel; Stripe webhooks (attach/checkout/billing) will NOT be delivered."
    log "  Add NGROK_AUTHTOKEN (+ optionally STRIPE_SANDBOX_SECRET_KEY/CLIENT_ID) in Cursor Cloud secrets, then re-run."
    return
  fi
  mkdir -p "$(dirname "$TUNNEL_LOG")"
  rm -f "$TUNNEL_STATE"
  log "starting ngrok tunnel + Stripe webhook registration (background)"
  nohup bun scripts/setup/cloud-tunnel.ts up >"$TUNNEL_LOG" 2>&1 &
  disown || true
  for _ in $(seq 1 60); do
    if [ -f "$TUNNEL_STATE" ] && grep -q '"publicUrl"' "$TUNNEL_STATE" 2>/dev/null; then
      log "tunnel public URL: $(grep -oE '"publicUrl": *"[^"]+"' "$TUNNEL_STATE" | head -1 | sed 's/.*"publicUrl": *"//;s/"$//')"
      return
    fi
    sleep 0.5
  done
  log "tunnel did not report a public URL yet — check $TUNNEL_LOG (continuing)"
}

# --- main --------------------------------------------------------------------
start_dev_services
start_goaws
sync_deps_and_ai
write_server_env
migrate_db

log "provisioning complete:"
log "  postgres    :5432   redis-stack :6379   dragonfly :6380   goaws :9324"
log "  server      :8080   vite        :3000   checkout  :3001   leaf  :3099"

if [ "$SERVICES_ONLY" = "1" ]; then
  log "--services given; not starting the app. Run: bun scripts/dw/index.ts"
  exit 0
fi

start_tunnel

log "starting the dev stack (bun dw → scripts/dev.ts) ..."
exec bun scripts/dw/index.ts
