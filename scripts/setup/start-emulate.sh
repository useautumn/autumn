#!/usr/bin/env bash
set -euo pipefail

# Idempotent emulate.dev launcher. Starts a single Google emulator
# instance shared by every agent worktree on this host.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEED="$ROOT/emulate.config.yaml"

if curl -sf -o /dev/null --max-time 1 "https://google.emulate.localhost/.well-known/openid-configuration"; then
	echo "[emulate] google emulator already reachable at https://google.emulate.localhost"
	exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
	echo "[emulate] npx not found; install Node.js / npm" >&2
	exit 1
fi

echo "[emulate] launching emulate (portless, google only) with seed $SEED"
exec npx --yes emulate --portless --service google --seed "$SEED"
