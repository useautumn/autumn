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

if [ ! -f "$marker" ]; then
  exec_local_shell
fi

# shellcheck disable=SC1090
. "$marker"   # sets: host, path
if [ -z "${host:-}" ] || [ -z "${path:-}" ]; then
  echo "[sw] malformed $marker; using local shell" >&2
  exec_local_shell
fi

# exec $SHELL on the REMOTE side resolves to the devbox's shell (not this wrapper).
exec ssh -t -o ServerAliveInterval=30 -o ServerAliveCountMax=3 "$host" \
  "cd '${path}' 2>/dev/null || cd; exec \"\$SHELL\" -l"
