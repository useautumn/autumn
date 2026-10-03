#!/usr/bin/env bash
# setup for .claude/skills/tesser/autumn.toml; runs before every `tesser dev autumn`.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.bun/bin:$(npm prefix -g)/bin:$PATH"

# The box's own bun is whatever was latest when its image was built.
pinned="$(tr -d '[:space:]' <.bun-version)"
[ "$(bun --version)" = "$pinned" ] || curl -fsSL https://bun.sh/install | bash -s "bun-v$pinned"

# scripts/dev.ts frees its ports with lsof.
command -v lsof >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq lsof; }

bash scripts/setup/agent-bootstrap.sh
. scripts/setup/install-stripe-cli.sh
install_stripe_cli "[tesser-setup]"
command -v infisical >/dev/null || npm install -g --silent @infisical/cli
bun install --frozen-lockfile
