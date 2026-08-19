#!/usr/bin/env bash
# Cursor Cloud `start` — per-boot only.
# install.sh owns packages, bun install, and bun ai sync --copy.
# This script caches runtime secrets, then runs `dw start`
# (Postgres/Redis/ClickHouse/ElasticMQ + Cloudflare public URL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export CLOUD_AGENT=1
export DW_HEADLESS=1
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

BUN="${HOME}/.bun/bin/bun"
if [ ! -x "$BUN" ]; then
	BUN="$(command -v bun)"
fi

if [ -n "${INFISICAL_TOKEN:-}" ]; then
	mkdir -p "${HOME}/.cache"
	printf '%s' "$INFISICAL_TOKEN" > "${HOME}/.cache/autumn-infisical-token"
	chmod 600 "${HOME}/.cache/autumn-infisical-token"
	echo "[cursor-cloud-start] Infisical token ready"
else
	echo "[cursor-cloud-start] INFISICAL_TOKEN unset — set a Team Runtime Secret"
fi

pull_infisical() {
	local key="$1"
	[ -n "${!key:-}" ] && return 0
	command -v infisical >/dev/null 2>&1 || return 0
	local value
	value="$(infisical run --env=dev --recursive --silent -- printenv "$key" 2>/dev/null || true)"
	value="${value%%$'\n'*}"
	[ -n "$value" ] && export "$key=$value"
}

pull_infisical EXECUTOR_API_KEY
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
	echo "[cursor-cloud-start] CLOUDFLARE_TUNNEL_API_TOKEN ready"
else
	echo "[cursor-cloud-start] CLOUDFLARE_TUNNEL_API_TOKEN unset — no public hosts"
fi

"$BUN" "$ROOT/scripts/setup/cursor-cloud/cursorCloud.ts" persist-env
"$BUN" "$ROOT/scripts/setup/cursor-cloud/cursorCloud.ts" mcp
echo "[cursor-cloud-start] dw start (local infra + public URL)"
"$BUN" "$ROOT/scripts/dw/index.ts" start
