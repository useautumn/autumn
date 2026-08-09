#!/usr/bin/env bash
# Entry point for the workspace Run button (see .conductor/settings.toml).
#
# Deliberately does the provisioning too, rather than relying on scripts.setup:
# Conductor writes an untracked .conductor/settings.local.toml that shadows the
# tracked settings.toml's `setup` key, so .conductor/setup.sh never runs. Only
# `scripts.run.dev` is left unshadowed, so the work lives here.
set -euo pipefail

# The snapshot carries Docker images but not a running daemon, and these boxes
# have no systemd — setsid so the daemon outlives this script's process group.
if ! docker info >/dev/null 2>&1; then
  echo "[conductor] starting docker daemon"
  if ! sudo systemctl start docker 2>/dev/null; then
    sudo setsid dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  fi
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 \
    || { echo "[conductor] docker failed to start; see /tmp/dockerd.log" >&2; exit 1; }
fi

# `bun dw` provisions when needed and then starts the dev server, so this is
# idempotent across restarts of the Run button.
exec bun dw
