#!/usr/bin/env bash
# Cursor Cloud `start` — per-boot. Starts local Postgres/Redis/ClickHouse/ElasticMQ,
# mints Infisical token from machine identity, writes server/.env isolation overlay.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

export DW_HEADLESS=1
if ! grep -q 'export DW_HEADLESS=1' "${HOME}/.bashrc" 2>/dev/null; then
	echo 'export DW_HEADLESS=1' >> "${HOME}/.bashrc"
fi

# Machine-identity login. Cursor injects INFISICAL_CLIENT_ID/SECRET as runtime
# secrets; we never store them in the repo. Token is cached under ~/.cache.
if token="$(bash "$ROOT/scripts/setup/infisical-machine-login.sh")"; then
	export INFISICAL_TOKEN="$token"
	# Non-interactive agent shells don't source .bashrc; BASH_ENV covers `bash -c`.
	env_sh="${HOME}/.autumn-agent/env.sh"
	mkdir -p "${HOME}/.autumn-agent"
	cat > "$env_sh" <<'ENVSH'
export DW_HEADLESS=1
if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_CLIENT_ID:-}" ]; then
  ROOT_GUESS="${AUTUMN_ROOT:-/workspace}"
  if [ -x "$ROOT_GUESS/scripts/setup/infisical-machine-login.sh" ]; then
    INFISICAL_TOKEN="$("$ROOT_GUESS/scripts/setup/infisical-machine-login.sh" 2>/dev/null || true)"
    [ -n "$INFISICAL_TOKEN" ] && export INFISICAL_TOKEN
  fi
fi
ENVSH
	if ! grep -q autumn-agent/env.sh "${HOME}/.bashrc" 2>/dev/null; then
		echo ". ${env_sh}" >> "${HOME}/.bashrc"
	fi
	grep -q 'BASH_ENV' "${HOME}/.bashrc" 2>/dev/null || \
		echo "export BASH_ENV=${env_sh}" >> "${HOME}/.bashrc"
	export BASH_ENV="$env_sh"
	echo "[cursor-cloud-start] Infisical machine identity: token ready"
else
	echo "[cursor-cloud-start] Infisical machine identity not configured (INFISICAL_CLIENT_ID/SECRET unset)"
fi

bash scripts/setup/agent-services.sh
