#!/usr/bin/env bash
# Mint a short-lived Infisical token from the machine-identity client credentials
# Cursor injects as INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET. Prints the
# token to stdout. Always talks to the real CLI binary (not the PATH shim).
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
REAL="${ROOT}/node_modules/@infisical/cli/bin/infisical"
if [ ! -x "$REAL" ]; then
	echo "infisical CLI missing (expected ${REAL})" >&2
	exit 1
fi

# Persist a CLI session so any later `infisical run` (bun dw) is authenticated
# even in shells that never sourced start's INFISICAL_TOKEN.
# --plain skips that write, so do a silent login first, then capture the token.
"$REAL" login --method=universal-auth \
	--client-id="$INFISICAL_CLIENT_ID" \
	--client-secret="$INFISICAL_CLIENT_SECRET" \
	--silent >/dev/null

token="$("$REAL" login --method=universal-auth \
	--client-id="$INFISICAL_CLIENT_ID" \
	--client-secret="$INFISICAL_CLIENT_SECRET" \
	--plain --silent)"
printf '%s' "$token" > "$CACHE"
chmod 600 "$CACHE"
printf '%s' "$token"
