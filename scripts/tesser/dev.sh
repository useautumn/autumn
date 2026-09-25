#!/usr/bin/env bash
# Tesser dev recipe for .claude/skills/tesser/autumn.toml.
#
# scripts/setup/agent-services.sh starts local Postgres 18 / Redis Stack /
# ClickHouse / ElasticMQ, writes the isolation overlay into server/.env, runs
# migrations and loads the DB functions; then scripts/tesser/launch.sh runs
# scripts/dev.ts (server :8080, workers, Trigger.dev dev, vite :3000, checkout
# :3001, leaf :3099, stripe listen). The dashboard is served on the box's own
# address, http://<box_id>.localhost:3000, with the API proxied through vite.
#
# Two modes:
#   with Infisical    the machine identity Claude cloud sessions use, once per
#                     Tesser org:
#                       tesser env set autumn CODING_AGENT_CLIENT_ID
#                       tesser env set autumn CODING_AGENT_CLIENT_SECRET
#                     (each reads its value from stdin). Team secrets
#                     from Infisical dev, unit-test-org seeded, Stripe sandbox
#                     webhooks forwarded; DB/Redis/queues stay on the box.
#   without Infisical random ENCRYPTION_* / BETTER_AUTH_SECRET persisted on the
#                     box, fresh local DB, sign-in OTP printed in `tesser logs`;
#                     Stripe, Trigger.dev, email and Supabase are off.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
log() { echo "[tesser-dev] $*"; }

npm_bin="$(npm prefix -g 2>/dev/null || true)/bin"
export PATH="$PWD/node_modules/.bin:$HOME/.bun/bin:$npm_bin:/usr/local/bin:$PATH"
export CLOUD_AGENT=1
export DW_HEADLESS=1
export NODE_ENV=development
# The private ai submodule cannot clone on the box; never hang on a prompt.
export GIT_TERMINAL_PROMPT=0
# Serve every S3 edge config's default. Without it the misc-redis "backup"
# points at a Dragonfly the box can't reach ("Redis connection timeout for backup").
export AUTUMN_EDGE_CONFIG_OVERRIDE_B64="${AUTUMN_EDGE_CONFIG_OVERRIDE_B64:-e30=}"

# --- browser-facing URLs: the box's own address ------------------------------
# A page on <box_id>.localhost that calls bare localhost:8080 sends no
# cookies, and bare localhost:3000 shows whichever box is focused, so the
# dashboard must never name the API's host: SAME_ORIGIN_API makes vite proxy
# /__autumn_api and /api/auth to the server, and the page only talks to :3000.
if [ -n "${TESSER_BOX_ID:-}" ]; then
	host="${TESSER_BOX_ID}.localhost"
else
	log "WARNING: TESSER_BOX_ID unset; using localhost URLs (focus the box with: tesser use <box_id>)"
	host="localhost"
fi
export SAME_ORIGIN_API=1
export CLIENT_URL="http://${host}:3000"
export AUTUMN_API_URL="http://localhost:8080"
export AUTUMN_PUBLIC_API_URL="http://${host}:8080" # top-level navigations (OAuth callbacks) only
export VITE_FRONTEND_URL="http://${host}:3000"
export VITE_API_URL="http://${host}:8080" # checkout app only
export VITE_CHECKOUT_URL="http://${host}:3001"

# --- one Trigger.dev DEV branch and queue namespace per worktree -------------
# Every box runs as user `ubuntu`, so the default `<user>-<branch>` name would
# make teammates on the same git branch share (and archive) each other's
# queue. TESSER_SLOT is the worktree folder plus its Tesser owner.
slot="$(printf '%s' "${TESSER_SLOT:-${TESSER_BOX_ID:-$(hostname -s)}}" \
	| tr -cs 'A-Za-z0-9_' '-' | tr 'A-Z' 'a-z' | sed 's/^-//; s/-$//')"
export TRIGGER_DEV_BRANCH="${TRIGGER_DEV_BRANCH:-$(printf 'tesser-%s' "$slot" | cut -c1-48)}"
export WORKFLOW_QUEUE_NAMESPACE="${WORKFLOW_QUEUE_NAMESPACE:-local_${slot//-/_}}"

# --- local infra, isolation overlay (server/.env), migrations ---------------
bash scripts/setup/agent-services.sh

# writeAgentEnv pins localhost URLs into server/.env, and the server's env
# preload loads that file over the process env; point the browser-facing
# ones at the box address instead.
patch_env() {
	local file="$1" key="$2" value="$3"
	if grep -q "^${key}=" "$file"; then
		sed -i "s|^${key}=.*|${key}=${value}|" "$file"
	else
		printf '%s=%s\n' "$key" "$value" >>"$file"
	fi
}
patch_env server/.env CLIENT_URL "$CLIENT_URL"
patch_env server/.env AUTUMN_PUBLIC_API_URL "$AUTUMN_PUBLIC_API_URL"

# --- DynamoDB Local (idempotency keys) ---------------------------------------
# agent-services.sh covers Postgres/Redis/ClickHouse/ElasticMQ; boxes ship
# Docker, so run the emulator docker/dev-services.compose.yml uses on laptops.
export DYNAMODB_ENDPOINT="http://localhost:8000"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
	if ! docker ps --format '{{.Names}}' | grep -qx autumn-dynamodb; then
		docker rm -f autumn-dynamodb >/dev/null 2>&1 || true
		log "starting DynamoDB Local on :8000"
		docker run -d --name autumn-dynamodb --restart unless-stopped -p 8000:8000 \
			amazon/dynamodb-local:latest -jar DynamoDBLocal.jar -inMemory -sharedDb >/dev/null \
			|| log "WARNING: DynamoDB Local failed to start"
	fi
else
	log "WARNING: docker unavailable; skipping DynamoDB Local"
fi

# --- secrets: Infisical dev, or box-local random values ----------------------
if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${CODING_AGENT_CLIENT_ID:-}" ] && [ -n "${CODING_AGENT_CLIENT_SECRET:-}" ]; then
	log "logging in to Infisical with the CODING_AGENT machine identity"
	INFISICAL_TOKEN="$(infisical login --method=universal-auth \
		--client-id="$CODING_AGENT_CLIENT_ID" --client-secret="$CODING_AGENT_CLIENT_SECRET" \
		--plain --silent)" || INFISICAL_TOKEN=""
	if [ -z "$INFISICAL_TOKEN" ]; then
		echo "[tesser-dev] Infisical login failed; check: tesser env ls autumn" >&2
		exit 1
	fi
	export INFISICAL_TOKEN
fi

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	# Same cache scripts/setup/claude-cloud/with-env.sh reads, so tests run on
	# this box with: tesser exec <box> -- bash scripts/setup/claude-cloud/with-env.sh server -- bun test <file>
	(umask 077 && mkdir -p "$HOME/.cache" \
		&& printf '%s' "$INFISICAL_TOKEN" >"$HOME/.cache/autumn-infisical-token")
	# Machine-identity tokens need --projectId ("Project ID is required").
	project_id="$(node -p "require('./.infisical.json').workspaceId")"
	log "starting with Infisical dev secrets (TRIGGER_DEV_BRANCH=$TRIGGER_DEV_BRANCH)"
	exec env ENV_FILE=.env infisical run --projectId="$project_id" --env=dev --recursive --silent \
		-- bash scripts/tesser/launch.sh
fi

# No Infisical: the server refuses to boot without these three, and a random
# ENCRYPTION_PASSWORD cannot decrypt anything Infisical-encrypted, so this mode
# only ever talks to the box's own fresh database. Persist them so sessions
# and encrypted rows survive restarts of this box.
secrets_file="$HOME/.autumn-agent/tesser-local-secrets.env"
if [ ! -s "$secrets_file" ]; then
	log "no Infisical credentials; generating box-local auth/encryption secrets"
	rand() { openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'; }
	(
		umask 077
		mkdir -p "$(dirname "$secrets_file")"
		printf 'BETTER_AUTH_SECRET=%s\n' "$(rand 48)" >"$secrets_file"
		printf 'ENCRYPTION_IV=%s\n' "$(rand 12)" >>"$secrets_file"
		printf 'ENCRYPTION_PASSWORD=%s\n' "$(rand 48)" >>"$secrets_file"
	)
fi
set -a
# shellcheck disable=SC1090
. "$secrets_file"
set +a
log "starting without Infisical: fresh local DB, sign-in OTP appears in these logs; Stripe/Trigger/email are off"
exec bash scripts/tesser/launch.sh
