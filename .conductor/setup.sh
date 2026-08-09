#!/usr/bin/env bash
# Runs on every Conductor workspace creation (see .conductor/settings.toml).
#
# The cloud computer's install script bakes tools and Docker *images* into the
# machine snapshot, but a running daemon does not survive into a workspace — so
# start it here, before anything that needs containers.
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  # setsid, not a bare `&`: a backgrounded dockerd dies with the setup script's
  # process group when it exits, which is why the daemon was up during the build
  # and gone by the time a workspace shell ran.
  sudo systemctl start docker 2>/dev/null \
    || sudo setsid dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
docker info >/dev/null 2>&1 || echo "warning: docker daemon unavailable; dw will fail on containers" >&2

bun dw setup
