#!/usr/bin/env bash
#
# worktree-shell.sh — herdr `default_shell` for sw. Marker-gated: a `.herdr-remote`
# file in the pane's cwd → ssh into the devbox, so EVERY pane (incl. manually
# opened tabs/splits) lands on the box automatically. Otherwise exec the user's
# real login shell.
#
# herdr sets $SHELL to this script and execs it as each pane's login shell. The
# local fallback must NOT exec "$SHELL" (that would loop) AND must reset $SHELL to
# the real shell, or tools that detect the shell from $SHELL (direnv/mise/zoxide/
# p10k) emit the wrong syntax into the session.

set -u

marker="$PWD/.herdr-remote"

resolve_real_shell() {
  if [ -n "${SW_REAL_SHELL:-}" ] && [ -x "${SW_REAL_SHELL}" ]; then
    printf '%s' "$SW_REAL_SHELL"; return
  fi
  local detected=""
  if command -v dscl >/dev/null 2>&1; then          # macOS
    detected="$(dscl . -read "/Users/$(id -un)" UserShell 2>/dev/null | awk '{print $2}')"
  fi
  if [ -z "$detected" ] && command -v getent >/dev/null 2>&1; then  # Linux
    detected="$(getent passwd "$(id -un)" | cut -d: -f7)"
  fi
  for candidate in "$detected" /bin/zsh /bin/bash /bin/sh; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then printf '%s' "$candidate"; return; fi
  done
  printf '%s' /bin/sh
}

exec_local_shell() {
  local real
  real="$(resolve_real_shell)"
  export SHELL="$real"
  exec "$real" -l
}

# Escape hatch: `swdown` spawns a pane with SW_LOCAL=1 to get a LOCAL shell inside
# a remote worktree (bypassing the auto-ssh) so it can run `bun sw teardown`.
if [ "${SW_LOCAL:-}" = "1" ]; then
  exec_local_shell
fi

if [ ! -f "$marker" ]; then
  exec_local_shell
fi

# shellcheck disable=SC1090
. "$marker"   # sets: host, path
if [ -z "${host:-}" ] || [ -z "${path:-}" ]; then
  echo "[sw] malformed $marker; using local shell" >&2
  exec_local_shell
fi

# Use the sw-managed agent (started by `bun sw`) so ssh authenticates with no
# prompt; fall back to the macOS launchd agent if it's reachable.
SW_AGENT_SOCK="${XDG_CONFIG_HOME:-$HOME/.config}/atmn-sw/agent.sock"
if [ -S "$SW_AGENT_SOCK" ]; then
  export SSH_AUTH_SOCK="$SW_AGENT_SOCK"
elif [ -z "${SSH_AUTH_SOCK:-}" ] && command -v launchctl >/dev/null 2>&1; then
  SSH_AUTH_SOCK="$(launchctl getenv SSH_AUTH_SOCK 2>/dev/null)"
  [ -n "$SSH_AUTH_SOCK" ] && export SSH_AUTH_SOCK
fi

# Agent-status bridge: reverse-forward herdr's per-pane socket to the box and
# re-export the ids, so a coding agent (claude) running on the box reports its
# session back to herdr and shows up in the agents sidebar. Needs the box sshd to
# allow StreamLocalForwarding (provision.sh sets it).
bridge_opt=""
remote_env=""
if [ -n "${HERDR_SOCKET_PATH:-}" ] && [ -n "${HERDR_PANE_ID:-}" ]; then
  remote_sock="/tmp/herdr-$(printf '%s' "$HERDR_PANE_ID" | tr -c 'A-Za-z0-9' '_').sock"
  bridge_opt="-R ${remote_sock}:${HERDR_SOCKET_PATH}"
  remote_env="export HERDR_ENV=1 HERDR_SOCKET_PATH='${remote_sock}'"
  remote_env="${remote_env} HERDR_PANE_ID='${HERDR_PANE_ID}'"
  remote_env="${remote_env} HERDR_TAB_ID='${HERDR_TAB_ID:-}'"
  remote_env="${remote_env} HERDR_WORKSPACE_ID='${HERDR_WORKSPACE_ID:-}';"
fi

# exec $SHELL on the REMOTE side resolves to the devbox's shell (not this wrapper).
# The agent (sw started it) makes this passwordless; no ControlMaster (it breaks
# against a box that isn't ssh-ready yet).
# shellcheck disable=SC2086
exec ssh -t \
  -o StrictHostKeyChecking=accept-new -o AddKeysToAgent=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  ${bridge_opt} "$host" \
  "${remote_env} cd '${path}' 2>/dev/null || cd; exec \"\$SHELL\" -l"
