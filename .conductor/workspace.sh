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

# `dnf install docker` ships the engine but not the Compose plugin, so dw logs
# "docker compose not available; skipping infra stack" and every service that
# needs Redis/SQS/DynamoDB dies on ECONNREFUSED. Installed here rather than in
# the machine image so it needs no UI change; it is a no-op once present.
if ! docker compose version >/dev/null 2>&1; then
  echo "[conductor] installing docker compose plugin"
  sudo mkdir -p /usr/libexec/docker/cli-plugins
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/libexec/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
  docker compose version
fi

# `bun dw` with no args does NOT provision — cmdDefault falls through to a bare
# startDev when the registry has no entry, which is every fresh workspace. Run
# setup explicitly first; it is idempotent, so Run-button restarts are cheap.
bun dw setup
exec bun dw run
