#!/usr/bin/env bash
# Long-running Cloud terminal: ensure tunnels, then stay attached.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/ngrok-up.sh"
PIDFILE="${HOME}/.autumn-agent/ngrok.pid"
if [ -s "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
	wait "$(cat "$PIDFILE")" || exec sleep infinity
fi
exec sleep infinity
