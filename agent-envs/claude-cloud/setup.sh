#!/usr/bin/env bash
# Snapshot preparation, including Executor registration before Claude starts.
# Repo-dependent setup runs separately through the SessionStart hook.
set -uo pipefail
log() { echo "[claude-cloud-setup] $*"; }

# agent-bootstrap.sh calls sudo unconditionally; root images may lack it.
if ! command -v sudo >/dev/null 2>&1; then
	sudo() { "$@"; }
	export -f sudo
fi

WARM_DIR=/opt/autumn-bootstrap

# --- bun (pinned to the repo's .bun-version) --------------------------------
# Cloud VMs preinstall a stale bun (1.3.11 silently skipped a patches/ entry),
# and bun.sh is 403'd by default egress — npm registry is proxy-exempt, so npm
# is the reliable install path (verified: 6s in a cloud VM).
bun_ver="$(curl -fsSL https://raw.githubusercontent.com/useautumn/autumn/main/.bun-version 2>/dev/null | tr -d '[:space:]' || true)"
have_bun="$(bun --version 2>/dev/null || true)"
if [ -n "$bun_ver" ] && [ "$have_bun" != "$bun_ver" ]; then
	log "installing bun ${bun_ver} via npm (found ${have_bun:-none})"
	npm install -g --silent "bun@${bun_ver}" \
		|| curl -fsSL https://bun.sh/install | bash -s "bun-v${bun_ver}" \
		|| log "bun install failed"
elif [ -z "$have_bun" ]; then
	npm install -g --silent bun || log "bun install failed"
fi
if [ -x "${HOME}/.bun/bin/bun" ] && ! command -v bun >/dev/null 2>&1; then
	ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun || true
	ln -sf "${HOME}/.bun/bin/bunx" /usr/local/bin/bunx || true
fi
npm_bin="$(npm prefix -g 2>/dev/null)/bin"
if [ -x "$npm_bin/bun" ] && [ "$("$npm_bin/bun" --version)" = "$bun_ver" ]; then
	export PATH="$npm_bin:$PATH"
	if [ "$npm_bin/bun" != /usr/local/bin/bun ]; then
		ln -sf "$npm_bin/bun" /usr/local/bin/bun
	fi
fi
command -v bun >/dev/null 2>&1 && log "bun $(bun --version)"

# --- shallow public clone: bootstrap scripts + bun cache warm ---------------
if [ ! -d "$WARM_DIR/.git" ]; then
	git clone --depth 1 https://github.com/useautumn/autumn.git "$WARM_DIR" \
		|| log "warm clone failed — session hook installs everything instead"
fi

# --- system packages (postgres, redis-stack, clickhouse, jre, elasticmq) ----
if [ -f "$WARM_DIR/scripts/setup/agent-bootstrap.sh" ]; then
	bash "$WARM_DIR/scripts/setup/agent-bootstrap.sh" || log "agent-bootstrap failed"
fi

# --- Stripe CLI (stripe listen → localhost webhooks) ------------------------
if [ -f "$WARM_DIR/scripts/setup/install-stripe-cli.sh" ]; then
	# shellcheck disable=SC1091
	. "$WARM_DIR/scripts/setup/install-stripe-cli.sh"
	install_stripe_cli "[claude-cloud-setup]" || log "stripe cli install failed"
fi

# --- cloudflared (bun dw public URLs — the only way to view the app) --------
if [ ! -x /usr/local/bin/cloudflared ]; then
	arch="$(uname -m)"
	case "$arch" in
		x86_64) cf_arch="amd64" ;;
		aarch64 | arm64) cf_arch="arm64" ;;
		*) cf_arch="amd64" ;;
	esac
	cf_tmp="$(mktemp -d)"
	cf_ver="2026.8.2"
	if curl -fsSL -o "$cf_tmp/cloudflared" \
		"https://github.com/cloudflare/cloudflared/releases/download/${cf_ver}/cloudflared-linux-${cf_arch}"; then
		install -m 0755 "$cf_tmp/cloudflared" /usr/local/bin/cloudflared
		/usr/local/bin/cloudflared --version || true
	else
		log "cloudflared download failed"
	fi
	rm -rf "$cf_tmp"
fi

# --- Infisical CLI + login helper -------------------------------------------
# Must be >= 0.43.116: earlier versions ignore INFISICAL_PROJECT_ID.
if ! command -v infisical >/dev/null 2>&1; then
	npm install -g --silent @infisical/cli@0.43.120 || log "infisical cli install failed"
fi

# Prints a fresh token: export INFISICAL_TOKEN=$(autumn-infisical-login)
# A helper script rather than a baked value so nothing expires and no
# credential lands in the snapshot.
tee /usr/local/bin/autumn-infisical-login >/dev/null <<'HELPER'
#!/bin/sh
if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
	echo "autumn-infisical-login: INFISICAL_CLIENT_ID/SECRET not set" >&2
	exit 1
fi
exec infisical login --method=universal-auth \
	--client-id="$INFISICAL_CLIENT_ID" \
	--client-secret="$INFISICAL_CLIENT_SECRET" \
	--plain --silent
HELPER
chmod +x /usr/local/bin/autumn-infisical-login

# --- shell env for every non-interactive bash (BASH_ENV, set in env vars) ---
# Auto-exports INFISICAL_TOKEN (30-min cache) and the cached Stripe sandbox
# key so the agent's tool-call shells see them without re-login.
tee /usr/local/share/autumn-env.sh >/dev/null <<'ENVSH'
export CLOUD_AGENT=1
export DW_HEADLESS=1
case ":$PATH:" in
*":/usr/local/bin:"*) ;;
*) export PATH="/usr/local/bin:$HOME/.bun/bin:$PATH" ;;
esac
if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_CLIENT_ID:-}" ]; then
	_tok_cache="$HOME/.cache/autumn-infisical-token"
	if [ -s "$_tok_cache" ] && [ -n "$(find "$_tok_cache" -mmin -30 2>/dev/null)" ]; then
		INFISICAL_TOKEN="$(cat "$_tok_cache")"
	else
		mkdir -p "$HOME/.cache"
		INFISICAL_TOKEN="$(autumn-infisical-login 2>/dev/null || true)"
		if [ -n "$INFISICAL_TOKEN" ]; then
			printf '%s' "$INFISICAL_TOKEN" >"$_tok_cache"
			chmod 600 "$_tok_cache"
		fi
	fi
	export INFISICAL_TOKEN
	unset _tok_cache
fi
if [ -z "${STRIPE_SANDBOX_SECRET_KEY:-}" ] && [ -s "$HOME/.cache/autumn-stripe-sandbox-secret-key" ]; then
	STRIPE_SANDBOX_SECRET_KEY="$(cat "$HOME/.cache/autumn-stripe-sandbox-secret-key")"
	export STRIPE_SANDBOX_SECRET_KEY
fi
ENVSH
chmod 644 /usr/local/share/autumn-env.sh
grep -q autumn-env.sh "${HOME}/.bashrc" 2>/dev/null \
	|| echo '. /usr/local/share/autumn-env.sh' >>"${HOME}/.bashrc"

# The helper must exist before Claude loads MCPs, including on the first session.
tee /usr/local/bin/autumn-executor-headers >/dev/null <<'EXECUTOR_HEADERS'
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
EXECUTOR_HEADERS
chmod 755 /usr/local/bin/autumn-executor-headers

AUTUMN_BOOTSTRAP_DIR="$WARM_DIR" node <<'EXECUTOR_CONFIG'
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { workspaceId } = JSON.parse(fs.readFileSync(path.join(process.env.AUTUMN_BOOTSTRAP_DIR, '.infisical.json'), 'utf8'));
const configPath = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
  : path.join(os.homedir(), '.claude.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
config.mcpServers ??= {};
config.mcpServers['executor-cloud'] = {
  type: 'http',
  url: 'https://executor.sh/mcp',
  headersHelper: '/usr/local/bin/autumn-executor-headers ' + "'" + workspaceId.replaceAll("'", "'\\''") + "'",
};
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
EXECUTOR_CONFIG
if [ "$?" -eq 0 ]; then
	log "Executor Infisical headers helper registered before session startup"
else
	log "WARNING: Executor registration failed"
fi

# --- warm bun's global cache so per-session installs are fast ---------------
if command -v bun >/dev/null 2>&1 && [ -f "$WARM_DIR/package.json" ]; then
	log "warming bun cache (frozen lockfile, 4-min cap)"
	(cd "$WARM_DIR" && timeout 240 bun install --frozen-lockfile) \
		|| log "bun cache warm incomplete (fine — sessions install on demand)"
fi

log "setup complete"
exit 0
