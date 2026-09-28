#!/usr/bin/env bash
# Claude cloud SessionStart hook — wired via the committed .claude/settings.json.
# No-op outside cloud sessions (CLAUDE_CODE_REMOTE=true). Never blocks a session:
# every step is guarded and the script always exits 0.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT" || exit 0
export CLOUD_AGENT=1
export DW_HEADLESS=1
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
log() { echo "[claude-cloud] $*"; }

if [ -f /usr/local/share/autumn-env.sh ]; then
	. /usr/local/share/autumn-env.sh
fi

# Cloud VMs preinstall a stale bun (1.3.11 silently skipped a patches/ entry),
# so enforce the pin. npm registry is proxy-exempt; bun.sh is 403'd by default.
pinned_bun="$(tr -d '[:space:]' <.bun-version 2>/dev/null || true)"
npm_bin="$(npm prefix -g 2>/dev/null)/bin"
BUN="$npm_bin/bun"
if [ ! -x "$BUN" ]; then
	BUN="$(command -v bun 2>/dev/null || true)"
fi
if [ -z "$BUN" ] && [ -x "${HOME}/.bun/bin/bun" ]; then
	BUN="${HOME}/.bun/bin/bun"
fi
have_bun=""
[ -n "$BUN" ] && have_bun="$("$BUN" --version 2>/dev/null || true)"
if [ -n "$pinned_bun" ] && [ "$have_bun" != "$pinned_bun" ]; then
	log "installing bun ${pinned_bun} via npm (found ${have_bun:-none})"
	npm install -g --silent "bun@${pinned_bun}" >/dev/null 2>&1 \
		|| log "WARNING: npm bun install failed — continuing with ${have_bun:-none}"
	BUN="$npm_bin/bun"
fi
if [ -n "$pinned_bun" ] && [ "$("$BUN" --version)" != "$pinned_bun" ]; then
	log "ERROR: pinned bun unavailable — repo setup skipped"
	exit 0
fi
export PATH="$(dirname "$BUN"):$PATH"
if [ -z "$BUN" ] || [ ! -x "$BUN" ]; then
	log "ERROR: bun unavailable — repo setup skipped"
	exit 0
fi

# One full bootstrap per VM; SessionStart also fires on resume/clear/compact.
MARKER="${HOME}/.autumn-agent/claude-cloud-ready"
if [ ! -f "$MARKER" ]; then
	log "first session on this VM — bootstrapping repo"

	if git submodule update --init --recursive ai; then
		log "ai submodule ready"
	else
		log "WARNING: ai submodule clone failed. Skills, rules, and .mcp.json are"
		log "sourced from the private useautumn/ai repo — grant the Claude GitHub"
		log "app access to useautumn/ai (or attach it to the session) and retry:"
		log "  git submodule update --init --recursive ai && bun ai/src/cli.ts sync --copy"
	fi

	if [ -f ai/package.json ]; then
		(cd ai && "$BUN" install --frozen-lockfile) || log "WARNING: ai bun install failed"
		"$BUN" ai/src/cli.ts sync --copy || log "WARNING: bun ai sync failed"
	fi

	# Idempotent: instant when the snapshot already carries the packages, and
	# self-heals a VM whose setup script was skipped or partially failed.
	bash scripts/setup/agent-bootstrap.sh || log "WARNING: agent-bootstrap failed"

	"$BUN" install --frozen-lockfile || log "WARNING: workspace bun install failed"

	mkdir -p "$(dirname "$MARKER")" && touch "$MARKER"
	log "bootstrap complete"
fi

# --- persisted session env --------------------------------------------------
# Hook exports die with this process; CLAUDE_ENV_FILE carries them into every
# later Bash call. The empty edge-config override ({}) keeps server + tests off
# S3 edge config, whose misc-redis "backup" points at a Dragonfly the VM can't
# reach ("Redis connection timeout for backup").
: "${AUTUMN_EDGE_CONFIG_OVERRIDE_B64:=e30=}"
export AUTUMN_EDGE_CONFIG_OVERRIDE_B64
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
	{
		echo "export CLOUD_AGENT=1"
		echo "export DW_HEADLESS=1"
		echo "export AUTUMN_EDGE_CONFIG_OVERRIDE_B64=$AUTUMN_EDGE_CONFIG_OVERRIDE_B64"
		echo "export PATH=\"$ROOT/node_modules/.bin:\$PATH\""
	} >>"$CLAUDE_ENV_FILE"
fi

# --- runtime secrets (idempotent, cheap) -----------------------------------
# Machine identity for cloud sessions without an injected INFISICAL_TOKEN.
if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${CODING_AGENT_CLIENT_ID:-}" ] \
	&& [ -n "${CODING_AGENT_CLIENT_SECRET:-}" ] && command -v infisical >/dev/null 2>&1; then
	INFISICAL_TOKEN="$(infisical login --method=universal-auth \
		--client-id="$CODING_AGENT_CLIENT_ID" --client-secret="$CODING_AGENT_CLIENT_SECRET" \
		--plain --silent 2>/dev/null || true)"
	if [ -n "$INFISICAL_TOKEN" ]; then
		export INFISICAL_TOKEN
		log "Infisical: logged in with CODING_AGENT machine identity"
	else
		unset INFISICAL_TOKEN
		log "WARNING: Infisical login with CODING_AGENT credentials failed"
	fi
fi
if [ -n "${INFISICAL_TOKEN:-}" ]; then
	umask 077
	mkdir -p "${HOME}/.cache"
	printf '%s' "$INFISICAL_TOKEN" >"${HOME}/.cache/autumn-infisical-token"
	chmod 600 "${HOME}/.cache/autumn-infisical-token"
fi

infisical_project_id="$(node -p "require('./.infisical.json').workspaceId" 2>/dev/null || true)"
pull_infisical() {
	local key="$1"
	[ -n "${!key:-}" ] && return 0
	command -v infisical >/dev/null 2>&1 || return 0
	[ -n "${INFISICAL_TOKEN:-}" ] || return 0
	[ -n "$infisical_project_id" ] || return 0
	local value
	value="$(infisical secrets get "$key" --projectId="$infisical_project_id" \
		--env=dev --recursive --plain --silent 2>/dev/null || true)"
	value="${value%%$'\n'*}"
	[ -n "$value" ] && export "$key=$value"
}

pull_infisical STRIPE_SANDBOX_SECRET_KEY
if [ -n "${STRIPE_SANDBOX_SECRET_KEY:-}" ]; then
	umask 077
	mkdir -p "${HOME}/.cache"
	printf '%s' "$STRIPE_SANDBOX_SECRET_KEY" >"${HOME}/.cache/autumn-stripe-sandbox-secret-key"
	chmod 600 "${HOME}/.cache/autumn-stripe-sandbox-secret-key"
else
	log "STRIPE_SANDBOX_SECRET_KEY unavailable — unit-test-org seed will fail"
fi

pull_infisical CLOUDFLARE_TUNNEL_API_TOKEN
pull_infisical CLOUDFLARE_TUNNEL_ACCOUNT_ID
if [ -z "${CLOUDFLARE_TUNNEL_API_TOKEN:-}" ]; then
	pull_infisical CLOUDFLARE_API_TOKEN
	[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && export CLOUDFLARE_TUNNEL_API_TOKEN="$CLOUDFLARE_API_TOKEN"
fi
if [ -z "${CLOUDFLARE_TUNNEL_ACCOUNT_ID:-}" ]; then
	pull_infisical CLOUDFLARE_ACCOUNT_ID
	[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && export CLOUDFLARE_TUNNEL_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
fi
if [ -n "${CLOUDFLARE_TUNNEL_API_TOKEN:-}" ]; then
	umask 077
	mkdir -p "${HOME}/.autumn-agent"
	{
		printf 'CLOUDFLARE_TUNNEL_API_TOKEN=%s\n' "$CLOUDFLARE_TUNNEL_API_TOKEN"
		if [ -n "${CLOUDFLARE_TUNNEL_ACCOUNT_ID:-}" ]; then
			printf 'CLOUDFLARE_TUNNEL_ACCOUNT_ID=%s\n' "$CLOUDFLARE_TUNNEL_ACCOUNT_ID"
		fi
	} >"${HOME}/.autumn-agent/cloudflare.env"
else
	log "CLOUDFLARE_TUNNEL_API_TOKEN unavailable — bun dw gets no public URL"
fi

"$BUN" scripts/setup/claude-cloud/configureExecutorMcp.ts \
	|| log "WARNING: Executor Infisical auth configuration failed"

# --- session orientation (stdout is added to context) ----------------------
cat <<'EOF'

## Claude cloud session notes (Autumn)

- Skills, rules, and .mcp.json come from the private ai/ submodule via
  `bun ai/src/cli.ts sync --copy`, run by this hook on the first session start.
  If /tdd or /explain are missing, run that command and check the ai submodule.
- Local infra (Postgres/Redis/ClickHouse/ElasticMQ) is installed but NOT
  running. Start it with step 1 under "Running integration (e2e) tests" below
  (seeds unit-test-org, opens the Cloudflare public URL).
- There is no port preview in Claude cloud. To view the dashboard, use the
  public URLs from `bun dw identify` (autumn-wt1-<hash>.autumnworktree.com).
- Executor's executor-cloud MCP authenticates through a user-scope headers helper that fetches
  its key from Infisical dev on each connection. No separate Executor key is
  needed in the cloud environment. If tools are missing, reconnect Executor
  from /mcp; never attempt interactive MCP OAuth in a cloud VM.
- `bun t` (test suites) needs local Postgres via server/.env — never point
  tests at the Infisical PlanetScale DATABASE_URL.

### Running integration (e2e) tests in Claude cloud

This hook logs in to Infisical (CODING_AGENT_CLIENT_ID/SECRET) and caches the
token in ~/.cache/autumn-infisical-token; the Stripe sandbox key lands in
~/.cache/autumn-stripe-sandbox-secret-key. Tokens expire — re-run this hook
(`bash scripts/setup/claude-cloud/session-start.sh`) to refresh them.

- `infisical run --env=dev` injects the PlanetScale dev DATABASE_URL, and
  machine-identity tokens need `--projectId`, so plain `bun t` / `bun dw` either
  fail ("Project ID is required") or hit the remote DB. Use the wrapper, which
  adds `--projectId`, re-applies server/.env(.local) so DB/Redis/SQS stay local,
  exports the Stripe sandbox key + edge-config override, and refuses to run
  when DATABASE_URL is not local:
    bash scripts/setup/claude-cloud/with-env.sh [dir] -- <cmd>
- 1. Infra (also after a VM restart, check `uptime`), via the wrapper so the
  unit-test-org seed gets the Stripe sandbox key:
    bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/dw/index.ts start
  Starts Postgres/Redis/ClickHouse/ElasticMQ, runs migrations, loads DB
  functions and seeds unit-test-org. Ignore the cloudflared warning.
  If the seed is missing (`Org with slug "unit-test-org" not found`):
    bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/setup/setup-test.ts --ensure
  If balance sync logs `function sync_balances_v2 ... does not exist`, the DB
  functions are missing:
    bash scripts/setup/claude-cloud/with-env.sh -- bun scripts/migrations/migrate-functions.ts
- 2. App: `bun dw` hard-requires the Neon CLI; skip it. Start (or restart after
  any checkout/edit, neither hot-reloads) the API on :8080 and the workers:
    bash scripts/setup/claude-cloud/restart-app.sh
  Logs: ~/.autumn-agent/server.log and ~/.autumn-agent/workers.log.
- 3. Tests: `bash scripts/setup/claude-cloud/with-env.sh server -- bun test --timeout 0 <file>`
  Unit tests (tests/unit) need the wrapper too: the test preload builds a context.
- TDD red run: `git stash push -- server/src`, restart-app.sh, run the test
  (expect red), `git stash pop`, restart-app.sh, run again (expect green).
- `Redis connection timeout for backup` means AUTUMN_EDGE_CONFIG_OVERRIDE_B64
  is unset (this hook sets it to e30= = `{}`); server, workers and tests all
  need it. It serves every S3 edge config's default.
- "Fails on dev, passes on branch": `git checkout origin/dev`, then
  `git checkout <branch> -- <test files>`, restart the server, run; then check
  out the branch, restart, run again.
EOF

exit 0
