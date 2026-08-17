# Shared shell config for cloud workspaces, so a Conductor terminal behaves like
# a local one. Sourced from ~/.bashrc by .conductor/workspace.sh.
#
# NON-SECRET ONLY. Conductor's Environment section and this file are both visible
# to the whole org — personal API keys stay in ~/.zshrc on your own machine, and
# everything the app needs already arrives via `infisical run`.
#
# Mac-only entries from ~/.zshrc are deliberately absent: portless, emulate,
# windsurf, homebrew paths, and the `ol`/`agent` wrappers don't exist here.

# --- repo shortcuts (mirrors ~/.zshrc) --------------------------------------
alias d='bun d'
alias p='bun p'
alias dw='bun dw run'
alias t='bun t'
alias i='infisical run --env=dev --'
alias cc='claude --dangerously-skip-permissions'
alias oc='opencode'
alias co='codex --yolo'
alias tbc='tb --cloud'

# --- cloud-workspace conveniences -------------------------------------------
alias dwi='bun dw identify'
alias dwl='bun dw logs'
alias urls='bun dw identify | grep -E "URL|port"'

# --- paths -------------------------------------------------------------------
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

# Land in the repo rather than the sandbox home.
if [ -d "$HOME/autumn" ] && [ "$PWD" = "$HOME" ]; then
  cd "$HOME/autumn" || true
fi
