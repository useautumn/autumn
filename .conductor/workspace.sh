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
ensure_infisical_cli_installed || true
ensure_psql_installed || true
ensure_dw_binaries_installed || true

# A resumed Cloud workspace comes back without a running daemon.
. "$(dirname "$0")/startDocker.sh"
start_docker_daemon || true

exec bun dw run
