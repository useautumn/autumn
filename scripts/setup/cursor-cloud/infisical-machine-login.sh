#!/usr/bin/env bash
# Mint a short-lived Infisical token from the machine-identity client credentials
# Cursor injects as INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET. Prints the
# token to stdout. Caches for 30 minutes so nested shells don't re-login.
set -euo pipefail
CACHE="${HOME}/.cache/autumn-infisical-token"
mkdir -p "${HOME}/.cache"

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	printf '%s' "$INFISICAL_TOKEN"
	exit 0
fi

if [ -z "${INFISICAL_CLIENT_ID:-}" ] && [ -n "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-}" ]; then
	INFISICAL_CLIENT_ID="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID"
	INFISICAL_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-}"
fi

if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
	exit 1
fi

if [ -s "$CACHE" ] && [ -n "$(find "$CACHE" -mmin -30 2>/dev/null)" ]; then
	cat "$CACHE"
	exit 0
fi

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PATH="${ROOT}/node_modules/.bin:${HOME}/.bun/bin:/usr/local/bin:${PATH}"
if ! command -v infisical >/dev/null 2>&1; then
	echo "infisical CLI not on PATH (expected ${ROOT}/node_modules/.bin/infisical)" >&2
	exit 1
fi

token="$(infisical login --method=universal-auth \
	--client-id="$INFISICAL_CLIENT_ID" \
	--client-secret="$INFISICAL_CLIENT_SECRET" \
	--plain --silent)"
printf '%s' "$token" > "$CACHE"
chmod 600 "$CACHE"
printf '%s' "$token"
