#!/usr/bin/env bash
# Infisical's documented CI path (https://infisical.com/docs/cli/commands/run):
#
#   export INFISICAL_TOKEN=$(infisical login --method=universal-auth --plain --silent)
#   infisical run …
#
# `infisical run` (CLI 0.43.116) does NOT read client id/secret. GetInfisicalToken()
# only checks --token, INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN, and INFISICAL_TOKEN.
# Client credentials are for `login`, under Infisical's names:
#   INFISICAL_UNIVERSAL_AUTH_CLIENT_ID / INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
#
# Cursor Runtime Secrets use Autumn's names (INFISICAL_CLIENT_ID/SECRET) — same
# as the Node SDK in shared/utils/infisical.ts. We alias them here.
#
# Always talks to the real CLI binary (not the PATH shim). Prints the token to stdout.
set -euo pipefail
CACHE="${HOME}/.cache/autumn-infisical-token"
mkdir -p "${HOME}/.cache"

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	printf '%s' "$INFISICAL_TOKEN"
	exit 0
fi

export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-${INFISICAL_CLIENT_ID:-}}"
export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-${INFISICAL_CLIENT_SECRET:-}}"

if [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID}" ] || [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}" ]; then
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

# --plain --silent: token only, so it can be INFISICAL_TOKEN. Login's --client-id
# flag can also be substituted by INFISICAL_UNIVERSAL_AUTH_CLIENT_ID; we pass both.
token="$("$REAL" login --method=universal-auth \
	--client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
	--client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
	--plain --silent)"
printf '%s' "$token" > "$CACHE"
chmod 600 "$CACHE"
printf '%s' "$token"
