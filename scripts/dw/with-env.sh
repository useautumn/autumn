#!/usr/bin/env bash
# bun dw entry: use Infisical when credentials exist, otherwise server/.env
# (Cursor Cloud / DW_HEADLESS). Forwards all args to scripts/dw/index.ts.
# Named with-env.sh because a bare `run.sh` is gitignored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$HOME/.bun/bin:$PATH"

if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_CLIENT_ID:-}" ] && [ -n "${INFISICAL_CLIENT_SECRET:-}" ]; then
	if command -v infisical >/dev/null 2>&1; then
		INFISICAL_TOKEN="$(infisical login --method=universal-auth \
			--client-id="$INFISICAL_CLIENT_ID" \
			--client-secret="$INFISICAL_CLIENT_SECRET" \
			--plain --silent)"
		export INFISICAL_TOKEN
	fi
fi

if [ -n "${INFISICAL_TOKEN:-}" ] && command -v infisical >/dev/null 2>&1; then
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun scripts/dw/index.ts "$@"
fi

exec bun scripts/dw/index.ts "$@"
