#!/usr/bin/env bash
#
# capy-init.sh — Initialize lifecycle for Capy v2 VMs.
#
# Capy v2 ships Docker Engine and Compose, so local services use the same
# container definitions as `bun dw`. Initialize installs workspace dependencies,
# installs neonctl, and pulls the service images so snapshots can cache them.
# Runtime services belong in capy-startup.sh because snapshot builds only run
# Initialize and must not capture live containers or per-machine state.
#
# Idempotent. Safe to re-run.
set -euo pipefail

log() { echo "[capy-init] $*"; }
die() { echo "[capy-init] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

command -v bun >/dev/null 2>&1 || die "bun is required"
docker info >/dev/null 2>&1 || die "Docker Engine is required (use a Capy v2 VM)"
docker compose version >/dev/null 2>&1 || die "Docker Compose is required"

if [ "$(sysctl -n fs.inotify.max_user_watches)" -lt 524288 ]; then
  log "raising inotify watcher limit for the Trigger.dev source worker"
  if [ "$EUID" -eq 0 ]; then
    SUDO=()
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to configure inotify"
    SUDO=(sudo)
  fi
  echo fs.inotify.max_user_watches=524288 | "${SUDO[@]}" tee /etc/sysctl.d/99-autumn-capy.conf >/dev/null
  "${SUDO[@]}" sysctl --system >/dev/null
fi

if ! command -v psql >/dev/null 2>&1; then
  log "installing PostgreSQL client"
  if [ "$EUID" -eq 0 ]; then
    APT=(apt-get)
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to install psql"
    APT=(sudo apt-get)
  fi
  "${APT[@]}" update -qq
  DEBIAN_FRONTEND=noninteractive "${APT[@]}" install -y -qq postgresql-client
fi

# ---------------------------------------------------------------------------
# neonctl — needed by scripts/dw/helpers/neon.ts (which shells out to
# `neon …`). Install globally via bun; authenticates via NEON_API_KEY
# environment variable (see https://neon.com/docs/reference/neon-cli).
BUN_GLOBAL_BIN="$(bun pm -g bin 2>/dev/null || echo "$HOME/.bun/bin")"
case ":$PATH:" in
  *":$BUN_GLOBAL_BIN:"*) ;;
  *) export PATH="$BUN_GLOBAL_BIN:$PATH" ;;
esac
if ! command -v neon >/dev/null 2>&1 && ! command -v neonctl >/dev/null 2>&1; then
  log "installing neonctl globally via bun"
  bun install -g neonctl >/dev/null
fi

command -v neonctl >/dev/null 2>&1 || command -v neon >/dev/null 2>&1 || \
  die "neonctl installation did not put a binary on PATH"
log "neonctl ready"
log "psql ready"

# Bun workspace deps. Frozen-lockfile so a stale node_modules from a
# Capy snapshot is repaired without churn.
log "bun install --frozen-lockfile (workspace deps)"
( cd "$REPO_ROOT" && bun install --frozen-lockfile )

# Pull local infrastructure into the snapshot. The ngrok profile is
# intentionally excluded; Capy v2 discovers listening services directly.
log "pulling local service images"
(
  cd "$REPO_ROOT"
  COMPOSE_PROJECT_NAME=autumn-capy \
  DRAGONFLY_PORT=6379 \
  ELASTICMQ_PORT=9324 \
  DYNAMODB_PORT=8000 \
    docker compose -f scripts/setup/dw.compose.yml pull \
      dragonfly elasticmq dynamodb
)

docker compose -f scripts/setup/trigger.compose.yml config --images \
  | sort -u \
  | xargs -n1 docker pull

log "init complete"
