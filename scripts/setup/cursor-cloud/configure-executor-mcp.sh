#!/usr/bin/env bash
# Per-boot Executor MCP auth for Cursor Cloud.
#
# ai-sync drops the Authorization header when EXECUTOR_API_KEY is unset so
# laptop OAuth still works. Cloud cannot complete OAuth. Pull the key from
# Infisical (or a Team Runtime Secret already in the environment) and write
# a Bearer header into gitignored mcp.json. Never print the key.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${AUTUMN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
PY="$HERE/cursor_ai.py"
env_sh="${AUTUMN_AGENT_ENV_SH:-${HOME}/.autumn-agent/env.sh}"
user_mcp="${AUTUMN_USER_MCP:-${HOME}/.cursor/mcp.json}"
log() { echo "[cursor-cloud-executor] $*"; }

if [ -z "${EXECUTOR_API_KEY:-}" ] && command -v infisical >/dev/null 2>&1; then
	set +e
	pulled="$(infisical run --env=dev --recursive --silent -- printenv EXECUTOR_API_KEY 2>/dev/null)"
	st=$?
	set -e
	if [ "$st" -eq 0 ]; then
		pulled="${pulled%%$'\n'*}"
		if [ -n "$pulled" ]; then
			export EXECUTOR_API_KEY="$pulled"
		fi
	fi
fi

if [ -n "${EXECUTOR_API_KEY:-}" ]; then
	if [ -f "$env_sh" ]; then
		grep -v '^export EXECUTOR_API_KEY=' "$env_sh" >"${env_sh}.tmp" || true
		mv "${env_sh}.tmp" "$env_sh"
		printf 'export EXECUTOR_API_KEY=%q\n' "$EXECUTOR_API_KEY" >>"$env_sh"
		chmod 600 "$env_sh"
	fi
	python3 "$PY" --root "$ROOT" --user-mcp "$user_mcp" mcp-inject
	log "EXECUTOR_API_KEY ready (len=${#EXECUTOR_API_KEY}); executor MCP header written"
else
	python3 "$PY" --root "$ROOT" --user-mcp "$user_mcp" mcp-template
	log "EXECUTOR_API_KEY unset — wrote \${env:EXECUTOR_API_KEY} placeholder."
	log "Need Infisical EXECUTOR_API_KEY (dev vault) or a Team Runtime Secret of that name."
fi
