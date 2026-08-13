#!/usr/bin/env bash
# bun dw entry: use Infisical when credentials exist, otherwise server/.env
# (Cursor Cloud / DW_HEADLESS). Forwards all args to scripts/dw/index.ts.
# Named with-env.sh because a bare `run.sh` is gitignored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$HOME/.bun/bin:/usr/local/bin:$PATH"

if [ -z "${INFISICAL_TOKEN:-}" ]; then
	INFISICAL_TOKEN="$(bash "$ROOT/scripts/setup/infisical-machine-login.sh" 2>/dev/null || true)"
	export INFISICAL_TOKEN
fi

if [ -n "${INFISICAL_TOKEN:-}" ] && command -v infisical >/dev/null 2>&1; then
	# Infisical injects Stripe/ngrok/etc. server/.env then overlays local
	# DATABASE_URL / Redis / SQS so this VM does not share the team DB or queue.
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun scripts/dw/index.ts "$@"
fi

exec bun scripts/dw/index.ts "$@"
