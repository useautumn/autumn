#!/usr/bin/env bash
# Entry point for the workspace Run button (settings.toml -> scripts.run.dev).
#
# Provisioning lives in setup.sh, which Conductor runs once at workspace
# creation. This only starts the stack, so the Run button stays fast and can be
# hit repeatedly.
set -euo pipefail

# A resumed workspace comes back without a running daemon, and these boxes have
# no systemd. if/then rather than `a || b &`, which backgrounds the whole list.
if ! docker info >/dev/null 2>&1; then
  echo "[conductor] starting docker daemon"
  if ! sudo systemctl start docker 2>/dev/null; then
    sudo setsid dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  fi
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi

# setup.sh is still shadowed at runtime by an untracked settings.local.toml that
# only does ai-sync, so a fresh workspace often arrives unprovisioned. Without
# this, the Run button just exits 1 with "no provisioned worktree".
if ! bun dw identify >/dev/null 2>&1; then
  echo "[conductor] worktree not provisioned — running setup"
  bun dw setup
fi

exec bun dw run
