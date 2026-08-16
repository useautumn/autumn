#!/usr/bin/env bash
# Idempotent: start one Cloud ngrok tunnel for the dashboard, write public-urls.txt, exit.
# bun dw identify / setup / run call this. The ngrok terminal then stays attached.
# Paid Infisical NGROK_AUTHTOKEN: --url=https:// gives each VM a unique *.ngrok.app.
# Free token: ngrok assigns one static *.ngrok-free.dev for the whole account.
# The tunnel targets the path proxy (:3080), not Vite or the API directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

AGENT_DIR="${HOME}/.autumn-agent"
URLS="${AGENT_DIR}/public-urls.txt"
PIDFILE="${AGENT_DIR}/ngrok.pid"
LOG="${AGENT_DIR}/ngrok.log"
CFG="${AGENT_DIR}/ngrok.yml"
mkdir -p "$AGENT_DIR"

if [ -z "${INFISICAL_TOKEN:-}" ]; then
	INFISICAL_TOKEN="$(bash "$ROOT/scripts/setup/cursor-cloud/infisical-machine-login.sh" 2>/dev/null || true)"
	export INFISICAL_TOKEN
fi

if [ -z "${NGROK_AUTHTOKEN:-}" ] && [ -n "${INFISICAL_TOKEN:-}" ]; then
	NGROK_AUTHTOKEN="$(infisical run --env=dev --recursive --silent --token="$INFISICAL_TOKEN" -- \
		printenv NGROK_AUTHTOKEN 2>/dev/null || true)"
	NGROK_AUTHTOKEN="${NGROK_AUTHTOKEN%%$'\n'*}"
	export NGROK_AUTHTOKEN
fi

# Infisical also injects NGROK_API_KEY (reserved domains). Those names collide
# across Cloud VMs — this config uses a random *.ngrok.app instead.
unset NGROK_API_KEY

write_tunnels() {
	python3 - "$URLS" <<'PY'
import json, sys, urllib.request
out = sys.argv[1]
try:
    data = json.load(urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2))
except Exception as e:
    sys.stderr.write(f"[cursor-cloud-ngrok] could not read tunnel list: {e}\n")
    sys.exit(0)
lines = []
for t in data.get("tunnels", []):
    pub = t.get("public_url") or ""
    addr = (t.get("config") or {}).get("addr", "")
    name = t.get("name", "")
    if pub:
        lines.append(f"{name} ({addr}): {pub}")
        print(f"[cursor-cloud-ngrok] {name} ({addr}): {pub}")
text = "\n".join(lines) + ("\n" if lines else "ngrok up but no tunnels yet\n")
open(out, "w").write(text)
PY
}

dump_log() {
	if [ -f "$LOG" ]; then
		echo "[cursor-cloud-ngrok] ngrok.log:" >&2
		tail -n 40 "$LOG" >&2
	fi
}

# Free ngrok assigns one static hostname per authtoken. ERR_NGROK_334 means
# another session (other Cloud agent, leftover process, laptop) already holds it.
already_online_url() {
	python3 - "$LOG" <<'PY'
import re, sys
from pathlib import Path
log = Path(sys.argv[1])
if not log.is_file():
	sys.exit(0)
text = log.read_text(errors="replace")
if "ERR_NGROK_334" not in text and "already online" not in text:
	sys.exit(0)
m = re.search(r"https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:dev|app)", text)
if m:
	print(m.group(0))
PY
}

if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
	echo "[cursor-cloud-ngrok] already running"
	write_tunnels
	exit 0
fi

if [ -z "${NGROK_AUTHTOKEN:-}" ] || ! command -v ngrok >/dev/null 2>&1; then
	echo "[cursor-cloud-ngrok] no NGROK_AUTHTOKEN or ngrok binary — skip tunnel"
	{
		echo "ngrok: not running (no NGROK_AUTHTOKEN)"
		echo "dashboard: http://localhost:3000  (Cursor port-forward or remote desktop)"
		echo "api:       http://localhost:8080"
	} >"$URLS"
	exit 0
fi

cat > "$CFG" <<EOF
version: "2"
authtoken: ${NGROK_AUTHTOKEN}
web_addr: 127.0.0.1:4040
EOF
chmod 600 "$CFG"

PROXY_PORT="${DEV_PROXY_PORT:-3080}"
if [ -f "${AGENT_DIR}/dev-proxy.port" ]; then
	PROXY_PORT="$(tr -d '[:space:]' <"${AGENT_DIR}/dev-proxy.port")"
fi

start_ngrok() {
	: >"$LOG"
	# shellcheck disable=SC2086
	nohup ngrok http "$PROXY_PORT" --config "$CFG" --log=stdout "$@" \
		>"$LOG" 2>&1 &
	echo $! >"$PIDFILE"
}

wait_for_inspector() {
	local i
	for i in $(seq 1 40); do
		if [ -f "$PIDFILE" ] && ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
			return 1
		fi
		if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
			write_tunnels
			return 0
		fi
		sleep 0.5
	done
	return 1
}

stop_ngrok() {
	if [ -f "$PIDFILE" ]; then
		kill "$(cat "$PIDFILE")" 2>/dev/null || true
		rm -f "$PIDFILE"
	fi
}

echo "[cursor-cloud-ngrok] ensuring path proxy"
bun "$ROOT/scripts/dw/devProxy/server.ts" --ensure
if [ -f "${AGENT_DIR}/dev-proxy.port" ]; then
	PROXY_PORT="$(tr -d '[:space:]' <"${AGENT_DIR}/dev-proxy.port")"
fi

echo "[cursor-cloud-ngrok] starting unique dashboard tunnel → :${PROXY_PORT} (--url https://)"
# Paid plans: each VM gets its own *.ngrok.app. Free plans reject this.
start_ngrok --url 'https://'
if wait_for_inspector; then
	exit 0
fi
echo "[cursor-cloud-ngrok] random URL rejected (needs a paid NGROK_AUTHTOKEN); trying the account's static hostname" >&2
stop_ngrok

start_ngrok --pooling-enabled
if wait_for_inspector; then
	exit 0
fi

held="$(already_online_url || true)"
if [ -n "${held:-}" ]; then
	echo "[cursor-cloud-ngrok] free endpoint already online: ${held}" >&2
	echo "[cursor-cloud-ngrok] Infisical NGROK_AUTHTOKEN is a free ngrok account — one hostname for every Cloud agent. Put a paid authtoken in Infisical dev for a unique URL per VM." >&2
	echo "proxy (http://localhost:${PROXY_PORT}): ${held}" >"$URLS"
	exit 0
fi
echo "[cursor-cloud-ngrok] inspector :4040 never came up" >&2
dump_log
stop_ngrok
echo "ngrok started but inspector :4040 did not respond" >"$URLS"
exit 1
