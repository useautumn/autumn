#!/usr/bin/env bash
# Cursor Cloud `install` — durable, must terminate. Services belong in start.
#
# Do not pin a VM snapshot in environment.json. Builds overlay current
# exec-daemon / VNC tools onto snapshot-20260629 and crash before this script
# runs. The default Cloud image plus this install is the baseline.
set -euo pipefail
cd "$(dirname "$0")/../../.."
log() { echo "[cursor-cloud-install] $*"; }

export CLOUD_AGENT=1
export DW_HEADLESS=1

# Default Cloud image has no bun. Unguarded `command -v bun` exits 1 under set -e.
BUN="${HOME}/.bun/bin/bun"
if [ ! -x "$BUN" ]; then
	BUN="$(command -v bun 2>/dev/null || true)"
fi
if [ ! -x "$BUN" ]; then
	bun_ver="$(tr -d '[:space:]' < .bun-version 2>/dev/null || true)"
	log "installing bun ${bun_ver:-latest} (default Cloud image has none)"
	if [ -n "$bun_ver" ]; then
		curl -fsSL https://bun.sh/install | bash -s "bun-v${bun_ver}"
	else
		curl -fsSL https://bun.sh/install | bash
	fi
	BUN="${HOME}/.bun/bin/bun"
fi
if [ ! -x "$BUN" ]; then
	log "ERROR: bun is not executable after install"
	exit 1
fi
export PATH="$(dirname "$BUN"):${PATH}"
if [ ! -x /usr/local/bin/bun ]; then
	sudo ln -sf "$BUN" /usr/local/bin/bun
	sudo ln -sf "$(dirname "$BUN")/bunx" /usr/local/bin/bunx || true
fi
log "bun $($BUN --version) at $BUN"

log "init ai submodule (skills + MCP sync source)"
git submodule update --init --recursive

# Copy skills before apt / workspace install. Cloud freezes available_skills
# when the first chat starts; JIT agents often open that chat mid-install.
if [ -f ai/package.json ]; then
	log "ai deps + bun ai sync --copy (skills into ~/.cursor/skills)"
	(cd ai && "$BUN" install)
	"$BUN" ai/src/cli.ts sync --copy
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts mark-skills
	if [ ! -f "${HOME}/.cursor/skills/tdd/SKILL.md" ]; then
		log "ERROR: bun ai sync --copy did not write ~/.cursor/skills/tdd"
		exit 1
	fi
	log "user skills ready at ~/.cursor/skills"
fi

log "system packages (postgres, redis-stack, clickhouse, jre, elasticmq)"
bash scripts/setup/agent-bootstrap.sh

log "workspace install"
"$BUN" install --frozen-lockfile

if [ ! -x /usr/local/bin/stripe ]; then
	log "installing Stripe CLI (stripe listen → localhost webhooks)"
	arch="$(uname -m)"
	case "$arch" in
		x86_64) stripe_arch="x86_64" ;;
		aarch64|arm64) stripe_arch="arm64" ;;
		*) stripe_arch="x86_64" ;;
	esac
	tmp="$(mktemp -d)"
	stripe_ver="1.33.0"
	curl -fsSL -o "$tmp/stripe.tar.gz" \
		"https://github.com/stripe/stripe-cli/releases/download/v${stripe_ver}/stripe_${stripe_ver}_linux_${stripe_arch}.tar.gz"
	tar -xzf "$tmp/stripe.tar.gz" -C "$tmp"
	sudo install -m 0755 "$tmp/stripe" /usr/local/bin/stripe
	rm -rf "$tmp"
	stripe version
fi

if [ ! -x /usr/local/bin/cloudflared ]; then
	log "installing cloudflared (per-service public hosts)"
	arch="$(uname -m)"
	case "$arch" in
		x86_64) cf_arch="amd64" ;;
		aarch64|arm64) cf_arch="arm64" ;;
		*) cf_arch="amd64" ;;
	esac
	tmp="$(mktemp -d)"
	cf_ver="2026.8.2"
	curl -fsSL -o "$tmp/cloudflared" \
		"https://github.com/cloudflare/cloudflared/releases/download/${cf_ver}/cloudflared-linux-${cf_arch}"
	sudo install -m 0755 "$tmp/cloudflared" /usr/local/bin/cloudflared
	rm -rf "$tmp"
	/usr/local/bin/cloudflared --version
fi

if [ -f ai/package.json ]; then
	# Runtime Secrets are not available at build/install time — placeholder only.
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts persist-env
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts mcp
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts agents-md
fi

log "install complete"
