#!/usr/bin/env bash
set +x
set -euo pipefail

fail() { echo "[executor-auth] $*" >&2; exit 1; }
project_id="${1:?Infisical project ID is required}"

if [ -n "${INFISICAL_CLIENT_ID:-}" ] && [ -n "${INFISICAL_CLIENT_SECRET:-}" ]; then
	INFISICAL_TOKEN="$(infisical login --method=universal-auth \
		--client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" \
		--plain --silent 2>/dev/null)" || fail "Infisical login failed"
	[ -n "$INFISICAL_TOKEN" ] || fail "Infisical returned an empty token"
	export INFISICAL_TOKEN
elif [ -z "${INFISICAL_TOKEN:-}" ]; then
	fail "Infisical machine credentials are missing"
fi

EXECUTOR_API_KEY="$(infisical secrets get EXECUTOR_API_KEY \
	--projectId="$project_id" --env=dev --recursive --plain --silent \
	2>/dev/null)" || fail "Could not fetch the Executor key from Infisical dev"
[ -n "$EXECUTOR_API_KEY" ] || fail "Executor key is empty in Infisical dev"
case "$EXECUTOR_API_KEY" in
	*$'\n'* | *$'\r'*) fail "Executor key contains multiple lines" ;;
esac
export EXECUTOR_API_KEY
node -e 'process.stdout.write(JSON.stringify({Authorization: `Bearer ${process.env.EXECUTOR_API_KEY}`}))'
