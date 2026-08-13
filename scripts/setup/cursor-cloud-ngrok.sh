#!/usr/bin/env bash
# Public tunnels for the dashboard (:3000) and API (:8080) when Infisical has
# NGROK_AUTHTOKEN. Random domains — reserved names collide across concurrent
# Cursor Cloud VMs. Stripe webhooks do NOT need this; stripe listen handles those.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

if [ -z "${INFISICAL_TOKEN:-}" ]; then
	INFISICAL_TOKEN="$(bash "$ROOT/scripts/setup/infisical-machine-login.sh" 2>/dev/null || true)"
	export INFISICAL_TOKEN
fi

if [ -z "${NGROK_AUTHTOKEN:-}" ] && [ -n "${INFISICAL_TOKEN:-}" ]; then
	# Pull just the authtoken — do not eval the full Infisical dump (it includes
	# shared DATABASE_URL / SQS that must stay pointed at localhost).
	NGROK_AUTHTOKEN="$(infisical run --env=dev --recursive --silent --token="$INFISICAL_TOKEN" -- \
		printenv NGROK_AUTHTOKEN 2>/dev/null || true)"
	export NGROK_AUTHTOKEN
fi

URLS="${HOME}/.autumn-agent/public-urls.txt"
mkdir -p "${HOME}/.autumn-agent"

if [ -z "${NGROK_AUTHTOKEN:-}" ] || ! command -v ngrok >/dev/null 2>&1; then
	echo "[cursor-cloud-ngrok] no NGROK_AUTHTOKEN or ngrok binary."
	echo "[cursor-cloud-ngrok] Laptop: Cursor port forwarding (plug icon) → http://localhost:3000"
	echo "[cursor-cloud-ngrok] Or remote desktop → Chrome --no-sandbox → http://localhost:3000"
	{
		echo "ngrok: not running (no NGROK_AUTHTOKEN)"
		echo "dashboard: http://localhost:3000  (Cursor port-forward or remote desktop)"
		echo "api:       http://localhost:8080"
	} >"$URLS"
	exec sleep infinity
fi

cfg="${HOME}/.autumn-agent/ngrok.yml"
cat > "$cfg" <<EOF
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
chmod 600 "$cfg"
echo "[cursor-cloud-ngrok] starting tunnels → :8080 (api) and :3000 (dashboard)"
ngrok start --all --config "$cfg" --log=stdout &
ngrok_pid=$!

wrote=0
for _ in $(seq 1 30); do
	if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
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
		wrote=1
		break
	fi
	sleep 0.5
done
if [ "$wrote" -eq 0 ]; then
	echo "[cursor-cloud-ngrok] inspector :4040 never came up" >&2
	echo "ngrok started but inspector :4040 did not respond" >"$URLS"
fi

wait "$ngrok_pid"
