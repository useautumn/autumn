#!/usr/bin/env bash
# Cursor Cloud `install` — durable, must terminate. Services belong in start.
set -euo pipefail
cd "$(dirname "$0")/../.."
log() { echo "[cursor-cloud-install] $*"; }

BUN="${HOME}/.bun/bin/bun"
if [ ! -x "$BUN" ]; then
	BUN="$(command -v bun)"
fi

log "init ai submodule (skills + MCP sync source)"
git submodule update --init --recursive

log "workspace install"
"$BUN" install --frozen-lockfile

if [ -f ai/package.json ]; then
	log "ai deps + bun sync (skills, rules, MCP into .cursor/)"
	(cd ai && "$BUN" install)
	# Must run from the autumn root: `cd ai && bun sync` on a headless box
	# writes into ai/.cursor because findRepoRoot has no TTY to pick the parent.
	"$BUN" ai/src/cli.ts sync
fi

log "install complete"
