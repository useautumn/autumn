#!/usr/bin/env bash
# Prints how to open the dashboard/API from a laptop. Stays alive as a tmux pane.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
URLS="${HOME}/.autumn-agent/public-urls.txt"

# Sibling tmux panes (dw / ngrok) start at the same time.
sleep 8

port_up() {
	local port="$1"
	curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null \
		|| curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${port}" 2>/dev/null
}

stripe_up=0
pgrep -af 'stripe listen' >/dev/null 2>&1 && stripe_up=1

echo "=== Autumn on this Cursor Cloud VM ==="
echo
echo "Local ports:"
if port_up 3000; then echo "  dashboard  :3000  up"; else echo "  dashboard  :3000  not up yet (bun dw run)"; fi
if port_up 8080; then echo "  api        :8080  up"; else echo "  api        :8080  not up yet (bun dw run)"; fi
if port_up 3001; then echo "  checkout   :3001  up"; else echo "  checkout   :3001  not up yet"; fi
if [ "$stripe_up" -eq 1 ]; then
	echo "  stripe listen  running (Connect webhooks → :8080/webhooks/connect/sandbox)"
else
	echo "  stripe listen  not running — needs Infisical STRIPE_SANDBOX_SECRET_KEY"
fi
echo
echo "Open the dashboard from your laptop (best first):"
echo "  1. Cursor port forwarding — plug / Ports in the agent editor."
echo "     environment.json declares 3000 / 8080 / 3001; they should appear as"
echo "     localhost on your machine. Open http://localhost:3000"
echo "  2. Remote desktop on the agent page → Chrome --no-sandbox → http://localhost:3000"
echo "  3. ngrok public URL (only if Infisical has NGROK_AUTHTOKEN):"
if [ -f "$URLS" ]; then
	sed 's/^/     /' "$URLS"
else
	echo "     (ngrok pane has not written URLs yet)"
fi
echo
echo "Secrets: do not paste Infisical client IDs into chat. Add Runtime Secrets"
echo "  INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET on"
echo "  https://cursor.com/dashboard/cloud-agents/environments/e/401b82fb-73ca-11f1-a8a0-cafc5ef88358"
echo
echo "(this pane sleeps so the instructions stay visible)"
exec sleep infinity
