#!/usr/bin/env bash
#
# capy-startup.sh — per-VM-startup hook for Capy sandboxes.
#
# Runs on every fresh-VM boot (Setup `Startup` phase). Idempotent.
# Delegates the real work to scripts/capy/provision.ts so the heavy lifting
# (Neon branching, migrations, env-file writing) is one type-checked bun
# script instead of bash. We only do shell-only chores here:
#
#   - Surface $CAPY_PREFIX/bin and ~/.bun/bin on PATH so `dragonfly`,
#     `goaws`, `neonctl` are reachable.
#   - Fail-fast guard for NEON_API_KEY, with a pointer to the settings page
#     (the user needs to populate it manually; secrets aren't supported in
#     the MCP environment tool — see get_setup docs).
#   - Run the bun script.
#
# Anything that would block startup forever (waiting for a missing env var,
# repeated DDL on every restart, etc.) is the bun script's problem.
set -euo pipefail

log() { echo "[capy-startup] $*"; }
die() { echo "[capy-startup] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CAPY_PREFIX="${CAPY_PREFIX:-$HOME/.autumn-capy}"
export PATH="$CAPY_PREFIX/bin:$HOME/.bun/bin:$PATH"

# Quick sanity check — capy-init.sh must have run.
for bin in dragonfly goaws; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    die "$bin not on PATH. Run scripts/setup/capy-init.sh first."
  fi
done
if ! command -v neonctl >/dev/null 2>&1 && ! command -v neon >/dev/null 2>&1; then
  die "neonctl not on PATH. Run scripts/setup/capy-init.sh first."
fi

if [ -z "${NEON_API_KEY:-}" ]; then
  cat >&2 <<EOF
[capy-startup] NEON_API_KEY is not set.

Add a Neon personal API key (https://console.neon.tech → Account settings →
API keys) to the Capy project environment variables as NEON_API_KEY. The
Neon CLI reads it automatically.

Without it, scripts/capy/provision.ts cannot branch the dw-template Neon
branch for this sandbox.
EOF
  exit 1
fi

cd "$REPO_ROOT"
exec bun scripts/capy/provision.ts "$@"
