#!/usr/bin/env bash
# Runs once when Conductor creates a workspace (settings.toml -> scripts.setup).
# Everything slow and one-time lives here; workspace.sh only starts the stack.
set -euo pipefail

# The machine snapshot carries Docker images but not a running daemon, and these
# boxes have no systemd. if/then rather than `a || b &`, which would background
# the whole list instead of just the fallback.
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
# needs Redis/SQS/DynamoDB dies on ECONNREFUSED.
if ! docker compose version >/dev/null 2>&1; then
  echo "[conductor] installing docker compose plugin"
  sudo mkdir -p /usr/libexec/docker/cli-plugins
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/libexec/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
  docker compose version
fi

# Interactive terminals get the local aliases/PATH. Non-secret only — see the
# header in shellrc.sh.
if ! grep -q 'conductor/shellrc.sh' "$HOME/.bashrc" 2>/dev/null; then
  echo '[ -f "$HOME/autumn/.conductor/shellrc.sh" ] && . "$HOME/autumn/.conductor/shellrc.sh"' \
    >> "$HOME/.bashrc"
fi

# Neon branch, migrations, compose stack, .env.local, test org.
bun dw setup
