#!/usr/bin/env bash
set -euo pipefail

SERVER_PORT="${1:-8080}"
VITE_PORT="${2:-3000}"

export AGENT_SERVER_PORT="$SERVER_PORT"
export AGENT_VITE_PORT="$VITE_PORT"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/agent-services.sh"

exec SERVER_PORT="$SERVER_PORT" VITE_PORT="$VITE_PORT" bun scripts/dev.ts
