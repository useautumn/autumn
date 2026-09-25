#!/usr/bin/env bash
# Tesser setup recipe for .claude/skills/tesser/autumn.toml.
#
# Runs on the box before every `tesser dev autumn`, so every step is guarded
# and returns in seconds once done. Boxes are Ubuntu with Node, Docker and
# passwordless sudo; their bun is whatever was latest when the image was
# built, so the pinned one goes first on PATH.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
log() { echo "[tesser-setup] $*"; }

export DEBIAN_FRONTEND=noninteractive
npm_bin="$(npm prefix -g 2>/dev/null || true)/bin"
export PATH="$HOME/.bun/bin:$npm_bin:/usr/local/bin:$PATH"

# --- bun, pinned to .bun-version --------------------------------------------
pinned="$(tr -d '[:space:]' <.bun-version)"
if [ "$(bun --version 2>/dev/null || true)" != "$pinned" ]; then
	log "installing bun $pinned"
	npm install -g --silent "bun@${pinned}" \
		|| curl -fsSL https://bun.sh/install | bash -s "bun-v${pinned}"
	hash -r
fi
log "bun $(bun --version)"

# --- tools the dev path shells out to ---------------------------------------
# lsof: scripts/dev.ts and bun dw free the app ports with it before starting.
if ! command -v lsof >/dev/null 2>&1; then
	log "installing lsof"
	sudo apt-get update -qq
	sudo apt-get install -y -qq lsof
fi

# --- Postgres 18, Redis Stack, ClickHouse, JRE, ElasticMQ jar, bun install ---
bash scripts/setup/agent-bootstrap.sh

# --- Stripe CLI: scripts/dev.ts runs `stripe listen` with the sandbox key -----
# shellcheck disable=SC1091
. scripts/setup/install-stripe-cli.sh
install_stripe_cli "[tesser-setup]"

# --- Infisical CLI: dev.sh logs in with the CODING_AGENT machine identity -----
# Also what scripts/setup/claude-cloud/with-env.sh needs for tests on the box.
if ! command -v infisical >/dev/null 2>&1; then
	log "installing the Infisical CLI"
	npm install -g --silent @infisical/cli
	hash -r
fi

# --- workspace deps (agent-bootstrap installs only when node_modules is absent)
log "bun install --frozen-lockfile"
bun install --frozen-lockfile

log "setup complete"
