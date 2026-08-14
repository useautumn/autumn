#!/usr/bin/env bash
# Prints how to open the dashboard/API from a laptop. Stays alive as a tmux pane.
# Does not start bun dw or ngrok.
set -euo pipefail

port_up() {
	local port="$1"
	curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null \
		|| curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${port}" 2>/dev/null
}

echo "=== Autumn on this Cursor Cloud VM ==="
echo
echo "Boot starts Postgres/Redis/ClickHouse/ElasticMQ only."
echo "The app is NOT started automatically. If you need it:"
echo "  bun dw          # or: bun dw run"
echo
echo "Local ports:"
if port_up 3000; then echo "  dashboard  :3000  up"; else echo "  dashboard  :3000  down"; fi
if port_up 8080; then echo "  api        :8080  up"; else echo "  api        :8080  down"; fi
if port_up 3001; then echo "  checkout   :3001  up"; else echo "  checkout   :3001  down"; fi
if pgrep -af 'stripe listen' >/dev/null 2>&1; then
	echo "  stripe listen  running"
else
	echo "  stripe listen  not running (starts with bun dw when STRIPE_SANDBOX_SECRET_KEY is set)"
fi
echo
echo "Open the dashboard from your laptop (best first):"
echo "  Skip the in-IDE Browser tab — it stays blank (Cursor bug, any URL)."
echo "  1. Cursor port forwarding — plug / Ports in the agent editor → http://localhost:3000 in Chrome/Safari"
echo "  2. Remote desktop on the agent page → Chrome --no-sandbox → http://localhost:3000"
echo "  3. Public URL — ngrok terminal (needs Team Runtime Secret NGROK_AUTHTOKEN)"
if [ -s "${HOME}/.autumn-agent/public-urls.txt" ]; then
	echo
	echo "Public URLs:"
	sed 's/^/  /' "${HOME}/.autumn-agent/public-urls.txt"
fi
echo
echo "(this pane sleeps so the instructions stay visible)"
exec sleep infinity
