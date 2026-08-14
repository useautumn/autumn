#!/usr/bin/env bash
# Infisical's documented CI path (https://infisical.com/docs/cli/commands/run):
#
#   export INFISICAL_TOKEN=$(infisical login --method=universal-auth --plain --silent)
#   infisical run …
#
# `infisical run` (CLI 0.43.116) does NOT read client id/secret. GetInfisicalToken()
# only checks --token, INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN, and INFISICAL_TOKEN.
#
# Cursor Runtime Secrets often land in `start` but not in later agent terminals.
# So: reuse a token file minted at boot before requiring CLIENT_ID in this process.
#
# Always talks to the real CLI binary (not the PATH shim). Prints the token to stdout.
set -euo pipefail
# env.sh is BASH_ENV; this flag stops env.sh from re-invoking this script.
export AUTUMN_INFISICAL_LOGIN_RUNNING=1
# Do not inherit BASH_ENV into the real CLI or further bash children.
unset BASH_ENV
CACHE="${HOME}/.cache/autumn-infisical-token"
mkdir -p "${HOME}/.cache"

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	printf '%s' "$INFISICAL_TOKEN"
	exit 0
fi

# Cache before credentials: bun dw may not see Runtime Secrets even when start did.
if [ -s "$CACHE" ] && [ -n "$(find "$CACHE" -mmin -90 2>/dev/null)" ]; then
	cat "$CACHE"
	exit 0
fi

export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-${INFISICAL_CLIENT_ID:-}}"
export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-${INFISICAL_CLIENT_SECRET:-}}"

if [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID}" ] || [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}" ]; then
	echo "infisical-machine-login: no INFISICAL_TOKEN cache and no INFISICAL_CLIENT_ID/SECRET in this process" >&2
	exit 1
fi

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REAL="${ROOT}/node_modules/@infisical/cli/bin/infisical"
if [ ! -x "$REAL" ]; then
	echo "infisical CLI missing (expected ${REAL})" >&2
	exit 1
fi

token="$("$REAL" login --method=universal-auth \
	--client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
	--client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
	--plain --silent)"
if [ -z "$token" ]; then
	echo "infisical-machine-login: login returned an empty token" >&2
	exit 1
fi
printf '%s' "$token" > "$CACHE"
chmod 600 "$CACHE"
printf '%s' "$token"
