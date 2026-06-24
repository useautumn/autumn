#!/usr/bin/env bash
#
# worktree-shell.sh — herdr `default_shell` for the sw (sandbox worktree) system.
#
# herdr sets $SHELL to this script and execs it as the login shell of EVERY pane,
# in that pane's cwd. For a worktree marked remote (a `.herdr-remote` file in the
# cwd) it ssh's into the devbox — so every pane, including ones opened by hand
# later, lands on the box automatically. For everything else it execs the user's
# real login shell. The marker is absent at worktree-create time, so the picker
# always runs locally; it appears only after a remote target is chosen.
#
# IMPORTANT: the local fallback must NOT exec "$SHELL" — herdr set $SHELL to THIS
# script, so that would loop. We resolve the user's real shell explicitly AND reset
# $SHELL to it, so tools that detect the shell from $SHELL (direnv, mise, zoxide,
# p10k…) don't think they're in bash and emit the wrong syntax into the session.

set -u

marker="$PWD/.herdr-remote"

exec_local_shell() {
  local real
  real="$(resolve_real_shell)"
  export SHELL="$real"
  exec "$real" -l
}

resolve_real_shell() {
  # Explicit override wins (install can bake the user's shell in).
  if [ -n "${SW_REAL_SHELL:-}" ] && [ -x "${SW_REAL_SHELL}" ]; then
    printf '%s' "$SW_REAL_SHELL"
    return
  fi
  local detected=""
  if command -v dscl >/dev/null 2>&1; then          # macOS
    detected="$(dscl . -read "/Users/$(id -un)" UserShell 2>/dev/null | awk '{print $2}')"
  fi
  if [ -z "$detected" ] && command -v getent >/dev/null 2>&1; then  # Linux
    detected="$(getent passwd "$(id -un)" | cut -d: -f7)"
  fi
  for candidate in "$detected" /bin/zsh /bin/bash /bin/sh; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s' "$candidate"
      return
    fi
  done
  printf '%s' /bin/sh
}

if [ ! -f "$marker" ]; then
  exec_local_shell
fi

# --- remote worktree: ssh into the devbox -----------------------------------
# shellcheck disable=SC1090
. "$marker"   # sets: target, host, path, branch

if [ -z "${host:-}" ] || [ -z "${path:-}" ]; then
  echo "[sw] malformed $marker (missing host/path); falling back to local shell" >&2
  exec_local_shell
fi

ssh_opts=(-t -o ServerAliveInterval=30 -o ServerAliveCountMax=3)

# Bridge herdr's agent-status hook over ssh: reverse-forward the local per-pane
# unix socket to a stable path on the box, and re-export the ids so the remote
# agent's hooks report back through the tunnel. Requires `StreamLocalBindUnlink
# yes` + `AllowStreamLocalForwarding yes` on the box's sshd (provision.sh sets it).
remote_env=""
if [ -n "${HERDR_SOCKET_PATH:-}" ] && [ -n "${HERDR_PANE_ID:-}" ]; then
  remote_sock="/tmp/herdr-${HERDR_PANE_ID}.sock"
  ssh_opts+=(-R "${remote_sock}:${HERDR_SOCKET_PATH}")
  remote_env="export HERDR_ENV=1 HERDR_SOCKET_PATH='${remote_sock}'"
  remote_env="${remote_env} HERDR_PANE_ID='${HERDR_PANE_ID}'"
  remote_env="${remote_env} HERDR_TAB_ID='${HERDR_TAB_ID:-}'"
  remote_env="${remote_env} HERDR_WORKSPACE_ID='${HERDR_WORKSPACE_ID:-}';"
fi

# exec $SHELL on the REMOTE side resolves to the devbox's shell (not this wrapper).
exec ssh "${ssh_opts[@]}" "$host" \
  "${remote_env} cd '${path}' 2>/dev/null || cd; exec \"\$SHELL\" -l"
