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
	NGROK_AUTHTOKEN="$(infisical export --env=dev --recursive --format=dotenv 2>/dev/null \
		| awk -F= '$1=="NGROK_AUTHTOKEN" { sub(/^[^=]+=/, ""); print; exit }' || true)"
	export NGROK_AUTHTOKEN
fi

if [ -z "${NGROK_AUTHTOKEN:-}" ] || ! command -v ngrok >/dev/null 2>&1; then
	echo "[cursor-cloud-ngrok] no NGROK_AUTHTOKEN or ngrok binary."
	echo "[cursor-cloud-ngrok] Open the dashboard via Cursor remote desktop → Chrome http://localhost:3000"
	echo "[cursor-cloud-ngrok] (Chrome needs --no-sandbox in this VM)."
	exec sleep infinity
fi

cfg="${HOME}/.autumn-agent/ngrok.yml"
mkdir -p "${HOME}/.autumn-agent"
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
exec ngrok start --all --config "$cfg" --log=stdout
