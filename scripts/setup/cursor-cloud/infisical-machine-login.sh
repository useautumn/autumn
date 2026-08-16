#!/usr/bin/env bash
# Infisical's documented `run` auth
# (https://infisical.com/docs/cli/commands/run#infisical-run:infisical-token):
#
#   export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
#     --client-id=… --client-secret=… --silent --plain)
#   infisical run …
#
# This script is that login. If INFISICAL_TOKEN is already set (Token Auth
# access token, or a previous login), print it and skip. Otherwise mint.
# Always talks to the real CLI binary. Prints the token to stdout.
set -euo pipefail
# env.sh is BASH_ENV; this flag stops env.sh from re-invoking this script.
export AUTUMN_INFISICAL_LOGIN_RUNNING=1
unset BASH_ENV
CACHE="${HOME}/.cache/autumn-infisical-token"
mkdir -p "${HOME}/.cache"

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	printf '%s' "$INFISICAL_TOKEN"
	exit 0
fi

# No TTL. Token Auth tokens last weeks; a 90-minute window discarded them.
if [ -s "$CACHE" ]; then
	cat "$CACHE"
	exit 0
fi

export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-${INFISICAL_CLIENT_ID:-}}"
export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-${INFISICAL_CLIENT_SECRET:-}}"

if [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID}" ] || [ -z "${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}" ]; then
	echo "infisical-machine-login: no INFISICAL_TOKEN (or cache) and no INFISICAL_CLIENT_ID/SECRET" >&2
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
