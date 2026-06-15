#!/usr/bin/env bash
set -euo pipefail

# Idempotent daemonized launcher for the emulate.dev Google emulator + portless
# proxy. Shared host-wide across every agent worktree. Logs go to
# ~/.autumn-emulate.log, PID at ~/.autumn-emulate.pid.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEED="$ROOT/emulate.config.yaml"
LOG="$HOME/.autumn-emulate.log"
PID_FILE="$HOME/.autumn-emulate.pid"
PORTLESS_PORT_FILE="$HOME/.portless/proxy.port"
EMULATE_URL="https://google.emulate.localhost"

PORTLESS_PROXY_PORT="${PORTLESS_PORT:-}"
if [[ -z "$PORTLESS_PROXY_PORT" && -f "$PORTLESS_PORT_FILE" ]]; then
	PORTLESS_PROXY_PORT="$(cat "$PORTLESS_PORT_FILE" 2>/dev/null || true)"
fi
if [[ -n "$PORTLESS_PROXY_PORT" && "$PORTLESS_PROXY_PORT" != "443" ]]; then
	EMULATE_URL="${EMULATE_URL}:${PORTLESS_PROXY_PORT}"
fi

reachable() {
	curl -sf -o /dev/null --max-time 1 "${EMULATE_URL}/.well-known/openid-configuration"
}

if reachable; then
	echo "[emulate] already reachable at ${EMULATE_URL}"
	exit 0
fi

if ! command -v bunx >/dev/null 2>&1; then
	echo "[emulate] bunx not found; install bun" >&2
	exit 1
fi

if ! command -v portless >/dev/null 2>&1; then
	echo "[emulate] installing portless globally via bun"
	bun install -g portless >/dev/null
fi

if ! command -v emulate >/dev/null 2>&1; then
	echo "[emulate] installing emulate globally via bun"
	bun install -g emulate >/dev/null
fi

if ! curl -sf -o /dev/null --max-time 1 -k "https://localhost" 2>/dev/null; then
	echo "[emulate] starting portless proxy (may prompt for sudo for port 443)"
	portless proxy start
fi

# Clean up any stale pid file pointing at a dead process.
if [[ -f "$PID_FILE" ]]; then
	if ! kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
		rm -f "$PID_FILE"
	fi
fi

echo "[emulate] spawning emulate daemon → $LOG"
nohup emulate --portless --service google --seed "$SEED" \
	>"$LOG" 2>&1 </dev/null &
echo $! >"$PID_FILE"
disown

# Block briefly until the emulator is actually serving so callers can race.
for _ in $(seq 1 30); do
	if reachable; then
		echo "[emulate] ready at ${EMULATE_URL} (pid $(cat "$PID_FILE"))"
		exit 0
	fi
	sleep 0.3
done

echo "[emulate] emulator failed to come up within 9s; tail of $LOG:" >&2
tail -n 20 "$LOG" >&2 || true
exit 1
