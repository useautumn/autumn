#!/usr/bin/env bash
# Entry point for the workspace Run button (settings.toml -> scripts.run.dev).
#
# Provisioning lives in setup.sh, which Conductor runs once at workspace
# creation. This only starts the stack, so the Run button stays fast and can be
# hit repeatedly.
set -euo pipefail

. "$(dirname "$0")/ensureTooling.sh"
ensure_bun_installed || true
ensure_neonctl_installed || true
ensure_psql_installed || true

# A resumed workspace comes back without a running daemon.
. "$(dirname "$0")/startDocker.sh"
start_docker_daemon || true

# setup.sh is still shadowed at runtime by an untracked settings.local.toml that
# only does ai-sync, so a fresh workspace often arrives unprovisioned. Without
# this, the Run button just exits 1 with "no provisioned worktree".
if ! bun dw identify >/dev/null 2>&1; then
  # Run the whole of setup.sh, not just `bun dw setup`: the compose plugin and
  # shell wiring live there too, and calling dw directly skipped both — which is
  # why workspaces came up with zero containers and no aliases.
  echo "[conductor] worktree not provisioned — running setup"
  bash "$(dirname "$0")/setup.sh"
fi

exec bun dw run
