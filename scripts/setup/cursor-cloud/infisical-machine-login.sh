#!/usr/bin/env bash
# Resolve INFISICAL_TOKEN for `infisical run` (CLI 0.43.116).
#
# Preferred: a Token Auth access token already in INFISICAL_TOKEN (Cursor
# Runtime Secret, or the cache start wrote for shells that do not get secrets).
# `run` accepts that token as-is — no login.
#
# Fallback: Universal Auth client id/secret. `run` will not exchange those
# (Infisical/cli#201 is still open); this script calls
# `login --method=universal-auth --plain --silent` and prints the JWT.
#
# Always talks to the real CLI binary (not the PATH shim). Prints the token.
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
