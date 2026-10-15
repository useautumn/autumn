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

# The infisical CLI ships as a workspace dependency; later shells may not have
# the session hook's PATH.
export PATH="$ROOT/node_modules/.bin:$PATH"

# Fresh VMs have no server/.env. Keep it to local endpoints only: it is sourced
# after Infisical injection, so any blank key would wipe a real secret.
if [ ! -f "$ROOT/server/.env" ]; then
	cat >"$ROOT/server/.env" <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/autumn
DATABASE_CRITICAL_URL=postgresql://postgres:postgres@localhost:5432/autumn
REDIS_URL=redis://localhost:6379
EOF
fi

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
# DATABASE_URL is required; an unset DATABASE_CRITICAL_URL falls back to it.
for db_var in DATABASE_URL DATABASE_CRITICAL_URL; do
	[ "$db_var" = DATABASE_CRITICAL_URL ] && [ -z "${DATABASE_CRITICAL_URL:-}" ] && continue
	case "${!db_var:-}" in
	*localhost* | *127.0.0.1*) ;;
	*)
		echo "with-env.sh: refusing to run, $db_var is not local" >&2
		exit 1
		;;
	esac
done
exec "$@"' "$ROOT" "$@"
