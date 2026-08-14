#!/usr/bin/env bash
# Idempotent: start Cloud ngrok tunnels if needed, write public-urls.txt, exit.
# bun dw identify / setup / run call this. The ngrok terminal then stays attached.
# Random domains — reserved NGROK_API_KEY names collide across Cloud VMs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

AGENT_DIR="${HOME}/.autumn-agent"
URLS="${AGENT_DIR}/public-urls.txt"
PIDFILE="${AGENT_DIR}/ngrok.pid"
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
# across Cloud VMs — this config uses random *.ngrok.app instead.
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
tunnels:
  api:
    addr: 8080
    proto: http
  vite:
    addr: 3000
    proto: http
EOF
chmod 600 "$CFG"
echo "[cursor-cloud-ngrok] starting tunnels → :8080 (api) and :3000 (dashboard)"
nohup ngrok start --all --config "$CFG" --log=stdout \
	>"${AGENT_DIR}/ngrok.log" 2>&1 &
echo $! >"$PIDFILE"

wrote=0
for _ in $(seq 1 30); do
	if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
		write_tunnels
		wrote=1
		break
	fi
	sleep 0.5
done
if [ "$wrote" -eq 0 ]; then
	echo "[cursor-cloud-ngrok] inspector :4040 never came up" >&2
	echo "ngrok started but inspector :4040 did not respond" >"$URLS"
	exit 1
fi
exit 0
