#!/usr/bin/env bash
# dev for .claude/skills/tesser/autumn.toml: local infra, then scripts/dev.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$PWD/node_modules/.bin:$HOME/.bun/bin:$(npm prefix -g)/bin:$PATH"
# Tesser runs recipes with NODE_ENV=production.
export NODE_ENV=development CLOUD_AGENT=1 DW_HEADLESS=1 GIT_TERMINAL_PROMPT=0
export AUTUMN_EDGE_CONFIG_OVERRIDE_B64=e30=

# Every box runs as ubuntu, so the default <user>-<branch> Trigger.dev branch
# would be shared by teammates on the same git branch. TESSER_SLOT is per worktree.
slot="$(printf %s "${TESSER_SLOT:-$TESSER_BOX_ID}" | tr A-Z a-z)"
export TRIGGER_DEV_BRANCH="tesser-${slot:0:40}"
export WORKFLOW_QUEUE_NAMESPACE="local_${slot//-/_}"

# A restart stops this run's whole process group; its own session keeps the
# ElasticMQ it starts in the background alive, like Postgres and Redis.
setsid -w bash scripts/setup/agent-services.sh

# The browser reaches this box at http://<box_id>.localhost. server/.env wins
# over the process env and over Infisical, so the URLs go there.
box="http://$TESSER_BOX_ID.localhost"
sed -i -E '/^(CLIENT_URL|AUTUMN_PUBLIC_API_URL|VITE_BACKEND_URL|VITE_FRONTEND_URL|VITE_API_URL|VITE_CHECKOUT_URL)=/d' server/.env
cat >>server/.env <<EOF
CLIENT_URL=$box:3000
AUTUMN_PUBLIC_API_URL=$box:8080
VITE_BACKEND_URL=$box:8080
VITE_FRONTEND_URL=$box:3000
VITE_API_URL=$box:8080
VITE_CHECKOUT_URL=$box:3001
EOF

if [ -n "${CODING_AGENT_CLIENT_ID:-}" ]; then
	(umask 077 && mkdir -p ~/.cache && infisical login --method=universal-auth --plain --silent \
		--client-id="$CODING_AGENT_CLIENT_ID" --client-secret="$CODING_AGENT_CLIENT_SECRET" \
		>~/.cache/autumn-infisical-token)
	AUTUMN_DB_DIRECT=1 bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/setup/setup-test.ts --ensure || true
	exec bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/dev.ts
fi

# No Infisical: the server won't boot without these, and they only ever
# encrypt this box's own database. Kept so sign-ins survive restarts.
secrets=~/.autumn-agent/tesser-local-secrets.env
[ -s "$secrets" ] || (umask 077 && printf 'BETTER_AUTH_SECRET=%s\nENCRYPTION_IV=%s\nENCRYPTION_PASSWORD=%s\n' \
	"$(openssl rand -hex 32)" "$(openssl rand -hex 8)" "$(openssl rand -hex 32)" >"$secrets")
set -a
. server/.env
. "$secrets"
set +a
exec bun scripts/dev.ts
