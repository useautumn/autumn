#!/usr/bin/env bash
# Dump Infisical `dev` secrets (no values logged) for agent shells, minus the
# isolation keys that must stay pointed at localhost.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$HOME/.bun/bin:/usr/local/bin:$PATH"

OUT="${HOME}/.autumn-agent/dev-secrets.env"
mkdir -p "${HOME}/.autumn-agent"

if [ -z "${INFISICAL_TOKEN:-}" ]; then
	INFISICAL_TOKEN="$(bash "$ROOT/scripts/setup/infisical-machine-login.sh" 2>/dev/null || true)"
	export INFISICAL_TOKEN
fi

if [ -z "${INFISICAL_TOKEN:-}" ] || ! command -v infisical >/dev/null 2>&1; then
	echo "[export-dev-secrets] skipped (no Infisical token)"
	exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
if ! infisical export --env=dev --format=dotenv --silent --token="$INFISICAL_TOKEN" >"$tmp"; then
	echo "[export-dev-secrets] infisical export failed" >&2
	exit 1
fi

# Keys that would point this VM at shared Neon / AWS / team URLs.
drop='^(DATABASE_URL|MISC_CACHE_DRAGONFLY_PUBLIC_URL|REDIS_URL|SQS_QUEUE_URL|SQS_QUEUE_URL_V2|TINYBIRD_CLICKHOUSE_URL|AUTUMN_API_URL|AUTUMN_PUBLIC_API_URL|CLIENT_URL|STRIPE_WEBHOOK_SKIP_VERIFY|BETTER_AUTH_SECRET|ENCRYPTION_IV|ENCRYPTION_PASSWORD|NEON_WORKTREE_API_KEY)='

count=0
: >"$OUT"
while IFS= read -r line || [ -n "$line" ]; do
	case "$line" in
		""|\#*) continue ;;
	esac
	if printf '%s\n' "$line" | grep -Eq "$drop"; then
		continue
	fi
	printf '%s\n' "$line" >>"$OUT"
	count=$((count + 1))
done <"$tmp"
chmod 600 "$OUT"
echo "[export-dev-secrets] wrote ${count} keys to ${OUT} (values not logged)"
