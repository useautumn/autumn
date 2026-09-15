#!/usr/bin/env bash
# Runs once when Conductor creates a workspace (settings.toml -> scripts.setup).
# Everything slow and one-time lives here; workspace.sh only starts the stack.
set -euo pipefail

# The machine snapshot carries Docker images but not a running daemon.
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

# Neon branch, migrations, compose stack, .env.local, test org. Its ai sync is what
# writes the Executor entry into .mcp.json.
bun dw setup

# That sync writes Claude's `${EXECUTOR_API_KEY}` placeholder, but Conductor never
# puts the key in the agent's environment, so it would expand to an empty Bearer.
# .mcp.json is gitignored, so resolving it here cannot leak the key into a commit.
bun scripts/setup/conductor/resolveExecutorKey.ts
