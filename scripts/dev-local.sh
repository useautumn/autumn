#!/usr/bin/env bash
set -euo pipefail

database_name="autumn"
if [[ "${1:-}" != "" && "${1:-}" != -* ]]; then
	database_name="$1"
	shift
fi

database_url="${LOCAL_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/autumn}"
database_base_url="${database_url%%\?*}"
database_query="${database_url#"$database_base_url"}"
database_url="${database_base_url%/*}/${database_name}${database_query}"
cache_url="${LOCAL_CACHE_URL:-redis://localhost:6379}"

echo "dev-local: overriding Infisical DATABASE_URL/CACHE_URL with local values and disabling CACHE_CERT"

exec infisical run --env=prod -- env \
	ENV_FILE=.env.prod \
	NODE_ENV=development \
	DATABASE_URL="${database_url}" \
	CACHE_URL="${cache_url}" \
	CACHE_URL_US_EAST="${cache_url}" \
	CACHE_CERT="" \
	REDIS_URL="${cache_url}" \
	bun scripts/dev.ts "$@"
