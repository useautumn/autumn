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
bash scripts/setup/cursor-cloud/wrap-infisical-bin.sh

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

if [ ! -x /usr/local/bin/ngrok ]; then
	log "installing ngrok (optional dashboard/API public URL)"
	arch="$(uname -m)"
	case "$arch" in
		x86_64) ngrok_arch="amd64" ;;
		aarch64|arm64) ngrok_arch="arm64" ;;
		*) ngrok_arch="amd64" ;;
	esac
	tmp="$(mktemp -d)"
	curl -fsSL -o "$tmp/ngrok.tgz" \
		"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${ngrok_arch}.tgz"
	sudo tar -xzf "$tmp/ngrok.tgz" -C /usr/local/bin ngrok
	rm -rf "$tmp"
	ngrok version
fi

if [ -f ai/package.json ]; then
	log "ai deps + bun sync (skills, rules, MCP into .cursor/)"
	(cd ai && "$BUN" install)
	# Must run from the autumn root: `cd ai && bun sync` on a headless box
	# writes into ai/.cursor because findRepoRoot has no TTY to pick the parent.
	"$BUN" ai/src/cli.ts sync
	# ai-sync writes gitignored **symlinks**. Cursor Cloud slash commands do
	# not follow those (same reason Devin gets copies). Materialize real dirs
	# and ~/.cursor/skills. Do not inject EXECUTOR_API_KEY here — Runtime
	# Secrets are not available at build/install time.
	python3 scripts/setup/cursor-cloud/cursor_ai.py materialize
	python3 scripts/setup/cursor-cloud/cursor_ai.py mcp-template
	python3 scripts/setup/cursor-cloud/cursor_ai.py agents-md
fi

log "install complete"
