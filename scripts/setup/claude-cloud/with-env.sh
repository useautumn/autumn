#!/usr/bin/env bash
# Runs a command with Infisical dev secrets, keeping DB/Redis/SQS local.
#
#   bash scripts/setup/claude-cloud/with-env.sh [dir] -- <cmd...>
#   e.g. bash scripts/setup/claude-cloud/with-env.sh server -- bun test --timeout 0 <file>
#
# `infisical run --env=dev` injects the PlanetScale dev DATABASE_URL, which
# overrides server/.env. Re-sourcing server/.env and server/.env.local after the
# injection keeps tests, the server and workers on the local services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
dir="."
if [ "${1:-}" != "--" ] && [ -n "${1:-}" ]; then
	dir="$1"
	shift
fi
[ "${1:-}" = "--" ] && shift
[ "$#" -gt 0 ] || {
	echo "usage: with-env.sh [dir] -- <cmd...>" >&2
	exit 2
}

token_file="${HOME}/.cache/autumn-infisical-token"
[ -s "$token_file" ] || {
	echo "missing $token_file — run: bash scripts/setup/claude-cloud/session-start.sh" >&2
	exit 1
}
export INFISICAL_TOKEN="$(cat "$token_file")"
project_id="$(cd "$ROOT" && node -p "require('./.infisical.json').workspaceId")"

cd "$ROOT/$dir"
ENV_FILE=.env exec infisical run --projectId="$project_id" --env=dev --recursive --silent -- \
	bash -c '
set -a
source "$0/server/.env"
[ -f "$0/server/.env.local" ] && source "$0/server/.env.local"
set +a
if [ -s "$HOME/.cache/autumn-stripe-sandbox-secret-key" ]; then
	export STRIPE_SANDBOX_SECRET_KEY="$(cat "$HOME/.cache/autumn-stripe-sandbox-secret-key")"
fi
export AUTUMN_EDGE_CONFIG_OVERRIDE_B64="${AUTUMN_EDGE_CONFIG_OVERRIDE_B64:-e30=}"
case "$DATABASE_URL" in
*localhost* | *127.0.0.1*) ;;
*)
	echo "with-env.sh: refusing to run, DATABASE_URL is not local" >&2
	exit 1
	;;
esac
exec "$@"' "$ROOT" "$@"
