#!/usr/bin/env bash
# Runs once when Conductor creates a workspace (settings.toml -> scripts.setup).
# Everything slow and one-time lives here; workspace.sh only starts the stack.
set -euo pipefail
cd "$(dirname "$0")/.."

# Conductor keeps setup output in its own UI only, so a failed provision leaves
# nothing on the box to debug. Keep a copy.
exec > >(tee /tmp/conductor-setup.log) 2>&1

# Nothing here may assume the Cloud computer install script provided anything:
# it is org-level UI state and emptying it silently removes bun and docker.
. "$(dirname "$0")/ensureTooling.sh"
ensure_bun_installed || exit 1
ensure_neonctl_installed || exit 1
ensure_psql_installed || exit 1

. "$(dirname "$0")/startDocker.sh"
start_docker_daemon || exit 1

ensure_compose_plugin

# Interactive terminals get the local aliases/PATH. Non-secret only — see the
# header in shellrc.sh.
if ! grep -q 'conductor/shellrc.sh' "$HOME/.bashrc" 2>/dev/null; then
  echo '[ -f "$HOME/autumn/.conductor/shellrc.sh" ] && . "$HOME/autumn/.conductor/shellrc.sh"' \
    >> "$HOME/.bashrc"
fi

# `bun dw setup` installs deps itself, but it can never get that far on a fresh
# workspace: scripts/dw/index.ts imports @autumn/env and dies at module load.
bun install

# The Infisical CLI ships in node_modules, so this has to follow bun install.
export PATH="$PWD/node_modules/.bin:$PATH"
. "$(dirname "$0")/ensureInfisical.sh"
ensure_infisical_session || exit 1

# Neon branch, migrations, compose stack, .env.local, test org. Its ai sync is what
# writes the Executor entry into .mcp.json.
bun dw setup

# That sync writes Claude's `${EXECUTOR_API_KEY}` placeholder, but Conductor never
# puts the key in the agent's environment, so it would expand to an empty Bearer.
# .mcp.json is gitignored, so resolving it here cannot leak the key into a commit.
bun scripts/setup/conductor/resolveExecutorKey.ts
