#!/usr/bin/env bash
#
# capy-startup.sh — Startup lifecycle for Capy v2 VMs.
#
# Runs whenever Capy starts or resumes a VM. Idempotent.
# Delegates the real work to scripts/capy/provision.ts so the heavy lifting
# (Neon branching, migrations, env-file writing) is one type-checked bun
# script instead of bash. This wrapper handles shell-only lifecycle work:
#
#   - Surface bun's global bin so neonctl is reachable.
#   - Start Dragonfly, ElasticMQ, and DynamoDB Local with Docker Compose.
#   - Run the bounded provisioning script and exit; Startup must not remain
#     attached to a long-running process.
set -euo pipefail

log() { echo "[capy-startup] $*"; }
die() { echo "[capy-startup] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export PATH="$HOME/.bun/bin:$PATH"

command -v bun >/dev/null 2>&1 || die "bun not on PATH"
docker info >/dev/null 2>&1 || die "Docker Engine is unavailable"
docker compose version >/dev/null 2>&1 || die "Docker Compose is unavailable"
if ! command -v neonctl >/dev/null 2>&1 && ! command -v neon >/dev/null 2>&1; then
  die "neonctl not on PATH. Run scripts/setup/capy-init.sh first."
fi

if [ -z "${NEON_API_KEY:-}" ]; then
  cat >&2 <<EOF
[capy-startup] NEON_API_KEY is not set.

Add a Neon personal API key to Settings → Project → Environment variables as
NEON_API_KEY. The Neon CLI reads it automatically.

Without it, scripts/capy/provision.ts cannot branch the dw-template Neon
branch for this VM.
EOF
  exit 1
fi

cd "$REPO_ROOT"

log "starting local infrastructure with Docker Compose"
COMPOSE_PROJECT_NAME=autumn-capy \
DRAGONFLY_PORT=6379 \
ELASTICMQ_PORT=9324 \
DYNAMODB_PORT=8000 \
  docker compose -f scripts/setup/dw.compose.yml -p autumn-capy up -d \
    dragonfly elasticmq dynamodb

exec bun scripts/capy/provision.ts "$@"
