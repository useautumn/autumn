#!/usr/bin/env bash
# Runs once when Conductor creates a workspace (settings.toml -> scripts.setup).
# Everything slow and one-time lives here; workspace.sh only starts the stack.
set -euo pipefail
cd "$(dirname "$0")/.."
here="$(dirname "$0")"

# Conductor keeps setup output in its own UI only, so a failed provision leaves
# nothing on the box to debug. Keep a copy.
exec > >(tee /tmp/conductor-setup.log) 2>&1

# --- shell environment, before anything slow --------------------------------
# Conductor starts the agent session while this script is still running, and a
# session snapshots ~/.bashrc once at startup. Anything written there later is
# invisible for that entire session, so PATH and the Infisical token have to
# land first — otherwise every `bun t` / `bun dw` opens an interactive login.
#
# Nothing below may assume the Cloud computer install script provided anything:
# it is org-level UI state and emptying it silently removes bun and docker.
. "$here/ensureTooling.sh"
ensure_bun_installed || exit 1
ensure_infisical_cli_installed || exit 1

if ! grep -q 'conductor/shellrc.sh' "$HOME/.bashrc" 2>/dev/null; then
  echo '[ -f "$HOME/autumn/.conductor/shellrc.sh" ] && . "$HOME/autumn/.conductor/shellrc.sh"' \
    >> "$HOME/.bashrc"
fi

. "$here/ensureInfisical.sh"
ensure_infisical_session || exit 1

# --- machine tooling --------------------------------------------------------
ensure_neonctl_installed || exit 1
ensure_psql_installed || exit 1

. "$here/startDocker.sh"
start_docker_daemon || exit 1
ensure_compose_plugin

# --- repo -------------------------------------------------------------------
# `bun dw setup` installs deps itself, but it can never get that far on a fresh
# workspace: scripts/dw/index.ts imports @autumn/env and dies at module load.
bun install

# Skills and .mcp.json come from here, and dw's own checkout has no credential.
. "$here/ensureAiSubmodule.sh"
ensure_ai_submodule || true

# Neon branch, migrations, compose stack, .env.local, test org. Its ai sync is what
# writes the Executor entry into .mcp.json.
bun dw setup

# That sync writes Claude's `${EXECUTOR_API_KEY}` placeholder, but Conductor never
# puts the key in the agent's environment, so it would expand to an empty Bearer.
# .mcp.json is gitignored, so resolving it here cannot leak the key into a commit.
bun scripts/setup/conductor/resolveExecutorKey.ts
