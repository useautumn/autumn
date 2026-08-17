#!/usr/bin/env bash
# Cursor Cloud `install` — durable, must terminate. Services belong in start.
set -euo pipefail
cd "$(dirname "$0")/../../.."
log() { echo "[cursor-cloud-install] $*"; }

BUN="${HOME}/.bun/bin/bun"
if [ ! -x "$BUN" ]; then
	BUN="$(command -v bun)"
fi

log "init ai submodule (skills + MCP sync source)"
git submodule update --init --recursive

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
	# Pin so Builds are reproducible. Bump when we want a CLI upgrade.
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
	# Pin so Builds are reproducible. Bump when we want a CLI upgrade.
	cf_ver="2026.8.2"
	curl -fsSL -o "$tmp/cloudflared" \
		"https://github.com/cloudflare/cloudflared/releases/download/${cf_ver}/cloudflared-linux-${cf_arch}"
	sudo install -m 0755 "$tmp/cloudflared" /usr/local/bin/cloudflared
	rm -rf "$tmp"
	/usr/local/bin/cloudflared --version
fi

if [ -f ai/package.json ]; then
	log "ai deps + bun sync (skills, rules, MCP into .cursor/)"
	(cd ai && "$BUN" install)
	# Must run from the autumn root: `cd ai && bun sync` on a headless box
	# writes into ai/.cursor because findRepoRoot has no TTY to pick the parent.
	export CLOUD_AGENT=1
	export DW_HEADLESS=1
	"$BUN" ai/src/cli.ts sync --copy
	# Runtime Secrets are not available at build/install time — placeholder only.
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts mcp
	"$BUN" scripts/setup/cursor-cloud/cursorCloud.ts agents-md
fi

log "install complete"
