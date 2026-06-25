#!/usr/bin/env bash
#
# provision.sh — runs ON the exe.dev devbox in two phases. Between them the Mac
# pushes the worktree branch straight to this box's clone (never to origin):
#
#   clone  REMOTE_PATH ORIGIN AUTUMN_INT AI_INT
#       native services (Dragonfly + goaws, no Docker), sshd socket-forwarding,
#       then clone the DEFAULT branch via the exe.dev GitHub integration hosts.
#   <Mac: git push <box>:<REMOTE_PATH> HEAD:refs/heads/BRANCH>
#   setup  REMOTE_PATH BRANCH SLUG DATABASE_URL HOOK_SRC BASE_ENV
#       check out the pushed branch, submodules + ai sync, deps, env, claude.
#
# PostgreSQL is intentionally absent — the box uses a Neon branch issued from the
# Mac. Idempotent: re-running each phase is a fast no-op once in place.
set -euo pipefail

log() { echo "[sw-provision] $*"; }

BIN_DIR="$HOME/.local/bin"
SW_DIR="$HOME/.config/sw"
LOG_DIR="$HOME/.local/state/sw/logs"
mkdir -p "$BIN_DIR" "$SW_DIR" "$LOG_DIR"
export PATH="$BIN_DIR:$HOME/.bun/bin:$PATH"

phase_clone() {
  local REMOTE_PATH="$1" ORIGIN="$2" AUTUMN_INT="$3" AI_INT="$4"
  local GOAWS_ARCH DF_ARCH
  case "$(uname -m)" in
    x86_64) GOAWS_ARCH="x86_64"; DF_ARCH="x86_64" ;;
    aarch64 | arm64) GOAWS_ARCH="arm64"; DF_ARCH="aarch64" ;;
    *) echo "[sw-provision] unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac

  # --- base packages + bun + lazygit + global npm tools + claude --------------
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y -qq || true
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      git curl ca-certificates python3 unzip jq rsync >/dev/null || true
  fi
  if ! command -v bun >/dev/null 2>&1; then
    log "installing bun"
    curl -fsSL https://bun.sh/install | bash >/dev/null
  fi
  if ! command -v lazygit >/dev/null 2>&1; then
    log "installing lazygit"
    local LG_ARCH LG_TAG
    LG_ARCH=$([ "$GOAWS_ARCH" = "arm64" ] && echo arm64 || echo x86_64)
    LG_TAG=$(curl -fsSL https://api.github.com/repos/jesseduffield/lazygit/releases/latest | jq -r .tag_name | sed 's/^v//')
    curl -fsSL "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LG_TAG}_Linux_${LG_ARCH}.tar.gz" \
      -o /tmp/lazygit.tar.gz && tar -xzf /tmp/lazygit.tar.gz -C "$BIN_DIR" lazygit && rm -f /tmp/lazygit.tar.gz
  fi
  log "installing @sirtenzin/hunks + claude code (bun global)"
  bun add -g @sirtenzin/hunks @anthropic-ai/claude-code >/dev/null 2>&1 || true

  # --- native SQS (goaws) + cache (Dragonfly), no Docker ----------------------
  if [ ! -x "$BIN_DIR/goaws" ]; then
    log "installing goaws ($GOAWS_ARCH)"
    curl -fsSL "https://github.com/Admiral-Piett/goaws/releases/latest/download/goaws_Linux_${GOAWS_ARCH}.tar.gz" -o /tmp/goaws.tar.gz
    tar -xzf /tmp/goaws.tar.gz -C "$BIN_DIR" goaws && rm -f /tmp/goaws.tar.gz
  fi
  if [ ! -x "$BIN_DIR/dragonfly" ]; then
    log "installing dragonfly ($DF_ARCH)"
    curl -fsSL "https://github.com/dragonflydb/dragonfly/releases/latest/download/dragonfly-${DF_ARCH}.tar.gz" -o /tmp/dragonfly.tar.gz
    tar -xzf /tmp/dragonfly.tar.gz -C /tmp
    install -m 0755 "/tmp/dragonfly-${DF_ARCH}" "$BIN_DIR/dragonfly" && rm -f /tmp/dragonfly.tar.gz "/tmp/dragonfly-${DF_ARCH}"
  fi
  cat >"$SW_DIR/goaws.yaml" <<'EOF'
Local:
  Host: localhost
  Scheme: http
  Port: 9324
  Region: us-east-1
  AccountId: "000000000000"
  LogToFile: false
  LogLevel: warn
  EnableDuplicates: true
  Queues:
    - Name: autumn.fifo
    - Name: autumn-track.fifo
EOF
  port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- ; }
  if ! port_open 6379; then
    log "starting dragonfly :6379"
    nohup "$BIN_DIR/dragonfly" --port 6379 --bind 127.0.0.1 \
      --dir "$HOME/.local/state/sw" --dbfilename dump >"$LOG_DIR/dragonfly.log" 2>&1 &
    disown || true
  fi
  if ! port_open 9324; then
    log "starting goaws :9324"
    nohup "$BIN_DIR/goaws" -config "$SW_DIR/goaws.yaml" >"$LOG_DIR/goaws.log" 2>&1 &
    disown || true
  fi

  # --- sshd: allow the herdr status-hook socket to be reverse-forwarded -------
  if [ -d /etc/ssh/sshd_config.d ] && [ ! -f /etc/ssh/sshd_config.d/sw-herdr.conf ]; then
    log "enabling unix-socket forwarding in sshd"
    printf 'AllowStreamLocalForwarding yes\nStreamLocalBindUnlink yes\n' \
      | sudo tee /etc/ssh/sshd_config.d/sw-herdr.conf >/dev/null
    sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null || true
  fi

  # --- clone the DEFAULT branch via the integration hosts ---------------------
  # Each repo is routed through its exe.dev integration (auth injected at the
  # network layer; no creds on the box). The Mac then pushes the worktree branch
  # straight to this clone, so origin is never touched.
  local REPO_PATH
  REPO_PATH="$(printf '%s' "$ORIGIN" | sed -e 's#^https://github.com/##' -e 's#\.git$##')"
  git config --global url."https://${AUTUMN_INT}.int.exe.xyz/${REPO_PATH}".insteadOf "https://github.com/${REPO_PATH}"
  git config --global url."https://${AI_INT}.int.exe.xyz/useautumn/ai".insteadOf "https://github.com/useautumn/ai"

  if [ ! -d "$REMOTE_PATH/.git" ]; then
    log "cloning $ORIGIN (default branch) -> $REMOTE_PATH"
    mkdir -p "$(dirname "$REMOTE_PATH")"
    git clone "$ORIGIN" "$REMOTE_PATH"
  fi
  # Allow the Mac to push the worktree branch even onto the checked-out branch.
  git -C "$REMOTE_PATH" config receive.denyCurrentBranch updateInstead
  log "clone phase ready: $REMOTE_PATH (awaiting branch push)"
}

phase_setup() {
  local REMOTE_PATH="$1" BRANCH="$2" SLUG="$3" DATABASE_URL="$4" HOOK_SRC="$5" BASE_ENV="$6" LOCAL_CHECKOUT="$7" BOX_SSH_DEST="$8"

  log "checking out $BRANCH"
  git -C "$REMOTE_PATH" checkout "$BRANCH"

  log "fetching submodules"
  git -C "$REMOTE_PATH" submodule update --init --recursive

  log "installing deps (bun install)"
  (cd "$REMOTE_PATH" && bun install --frozen-lockfile >/dev/null 2>&1) || \
    (cd "$REMOTE_PATH" && bun install >/dev/null 2>&1) || true

  if [ -d "$REMOTE_PATH/ai" ]; then
    log "syncing ai submodule"
    git -C "$REMOTE_PATH/ai" checkout main >/dev/null 2>&1 || true
    (cd "$REMOTE_PATH/ai" && bun install >/dev/null 2>&1) || true
    (cd "$REMOTE_PATH/ai" && bun sync >/dev/null 2>&1) || true
  fi

  # --- shell: zsh + your zshrc + tools on PATH for interactive ssh sessions ---
  log "setting up zsh + PATH"
  if command -v apt-get >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq zsh fzf zoxide >/dev/null 2>&1 || true
  fi
  if [ -f /tmp/sw-zshrc ]; then
    [ -f "$HOME/.zshrc" ] && cp "$HOME/.zshrc" "$HOME/.zshrc.sw-bak" 2>/dev/null || true
    # Comment out top-level (col-0) macOS-only lines: homebrew + /Users/ PATH
    # exports, /Users/ source lines, launchctl. Guarded blocks (`[ -f … ] && …`,
    # `if [[ -f … ]]`) start with `[`/`if`, so they're untouched and self-skip on
    # Linux — and only col-0 matches, so we never empty an if-body and break syntax.
    sed -E \
      -e 's@^(export[[:space:]].*(opt/homebrew|/Users/).*)@# sw-stripped (macOS-only): \1@' \
      -e 's@^((source|\.)[[:space:]].*/Users/.*)@# sw-stripped (macOS path): \1@' \
      -e 's@^(launchctl[[:space:]].*)@# sw-stripped (macOS-only): \1@' \
      /tmp/sw-zshrc >"$HOME/.zshrc"
  fi
  [ -f /tmp/sw-p10k.zsh ] && cp /tmp/sw-p10k.zsh "$HOME/.p10k.zsh"
  # Append a managed block so `bun`, `lazygit`, etc. are on PATH (a non-login ssh
  # session doesn't source the profile), plus `dev` to (re)attach the server tmux.
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
    touch "$rc"
    if ! grep -q '# sw:env' "$rc" 2>/dev/null; then
      {
        printf '\n# sw:env (managed)\n'
        printf 'export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"\n'
        printf 'export BROWSER="$HOME/.local/bin/xdg-open"\n'
        printf "alias dev='tmux new -A -s %s-dev'\n" "$SLUG"
        printf "alias devlog='tmux capture-pane -pt %s-dev -S -200'\n" "$SLUG"
      } >>"$rc"
    fi
  done
  ZSH_BIN="$(command -v zsh || true)"
  [ -n "$ZSH_BIN" ] && sudo chsh -s "$ZSH_BIN" "$(id -un)" >/dev/null 2>&1 || true
  # Pre-warm zinit so it clones p10k + plugins now (not on your first pane).
  if [ -n "$ZSH_BIN" ]; then
    log "pre-installing zinit + p10k (first shell would otherwise clone them)"
    timeout 180 "$ZSH_BIN" -ic exit >>"$LOG_DIR/zsh-warmup.log" 2>&1 || true
  fi

  # `swdown` (run on the box) tears the worktree down from your Mac. The box can't
  # auth to exe.dev/Neon, so it bounces through the forwarded herdr socket: open a
  # LOCAL pane in the Mac checkout (SW_LOCAL=1 bypasses the auto-ssh) and run
  # `bun run sw:teardown` there.
  mkdir -p "$HOME/.config/sw" "$BIN_DIR"
  printf 'LOCAL_CHECKOUT=%s\n' "$LOCAL_CHECKOUT" >"$HOME/.config/sw/teardown.env"
  printf '%s\n' "$BOX_SSH_DEST" >"$HOME/.config/sw/ssh-dest"
  cat >"$BIN_DIR/swdown" <<'SWDOWN'
#!/usr/bin/env python3
import json, os, socket, sys

sock = os.environ.get("HERDR_SOCKET_PATH")
pane = os.environ.get("HERDR_PANE_ID")
if not (sock and pane):
    sys.exit("swdown: not in a bridged herdr pane")
checkout = None
try:
    for line in open(os.path.expanduser("~/.config/sw/teardown.env")):
        if line.startswith("LOCAL_CHECKOUT="):
            checkout = line.rstrip("\n").split("=", 1)[1]
except Exception:
    pass
if not checkout:
    sys.exit("swdown: no LOCAL_CHECKOUT recorded")

def call(req):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(sock)
    s.sendall((json.dumps(req) + "\n").encode())
    data = s.recv(8192)
    s.close()
    return json.loads(data)

res = call({"id": "1", "method": "pane.split", "params": {
    "target_pane_id": pane, "direction": "down", "cwd": checkout,
    "focus": True, "env": {"SW_LOCAL": "1"}}})
newpane = (res.get("result") or {}).get("pane", {}).get("pane_id")
if not newpane:
    sys.exit(f"swdown: split failed: {res}")
call({"id": "2", "method": "pane.send_input", "params": {
    "pane_id": newpane, "text": "bun run sw:teardown", "keys": ["Enter"]}})
print("swdown: tearing down on your Mac (in a new local pane)…")
SWDOWN
  chmod +x "$BIN_DIR/swdown"

  # Browser shim: a CLI that opens a non-local URL pops your Mac browser via the
  # ssh reverse-forward (SW_OPEN_SOCK, set by the wrapper). Local URLs are no-ops.
  cat >"$BIN_DIR/xdg-open" <<'XDGOPEN'
#!/bin/sh
url="${1:-}"
[ -n "$url" ] || exit 0
[ -n "${SW_OPEN_SOCK:-}" ] || exit 0
# Send the box's ssh dest + the URL; the Mac listener opens it and forwards any
# embedded localhost port back to the box (so OAuth callbacks + dev-server links
# work). Local URLs are no longer skipped — they're forwarded + opened.
box="$(cat "$HOME/.config/sw/ssh-dest" 2>/dev/null)"
printf '%s\n%s\n' "$box" "$url" | python3 -c "import socket,sys,os; s=socket.socket(socket.AF_UNIX); s.connect(os.environ['SW_OPEN_SOCK']); s.sendall(sys.stdin.buffer.read())" 2>/dev/null || true
XDGOPEN
  chmod +x "$BIN_DIR/xdg-open"

  # --- env: infisical export (base) + per-worktree native-service overrides ---
  local OVERRIDES MERGED
  OVERRIDES="$(cat <<EOF
DATABASE_URL=${DATABASE_URL}
DATABASE_CRITICAL_URL=${DATABASE_URL}
REDIS_URL=redis://localhost:6379
CACHE_URL=redis://localhost:6379
CACHE_V2_DRAGONFLY_URL=redis://localhost:6379
SQS_QUEUE_URL_V2=http://localhost:9324/000000000000/autumn.fifo
TRACK_SQS_QUEUE_URL=http://localhost:9324/000000000000/autumn-track.fifo
STRIPE_WEBHOOK_SKIP_VERIFY=true
EOF
)"
  MERGED="$(printf '%s\n%s\n' "$(cat "$BASE_ENV")" "$OVERRIDES")"
  for target in server vite apps/checkout; do
    if [ -d "$REMOTE_PATH/$target" ]; then
      printf '%s\n' "$MERGED" >"$REMOTE_PATH/$target/.env.local"
    fi
  done

  log "running migrations against the neon branch"
  ( cd "$REMOTE_PATH" && DATABASE_URL="$DATABASE_URL" bun run db:migrate >/dev/null 2>&1 ) || true

  # --- claude: status hook + agent memory -------------------------------------
  mkdir -p "$HOME/.claude/hooks"
  install -m 0755 "$HOOK_SRC" "$HOME/.claude/hooks/herdr-agent-state.sh"
  python3 - "$HOME/.claude/settings.json" "$HOME/.claude/hooks/herdr-agent-state.sh" <<'PY'
import json, os, sys
path, hook = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        with open(path) as handle:
            data = json.load(handle)
    except Exception:
        data = {}
hooks = data.setdefault("hooks", {})
entry = {"matcher": "*", "hooks": [{"type": "command", "command": f"{hook} session"}]}
for event in ("SessionStart", "Stop", "Notification", "UserPromptSubmit"):
    bucket = hooks.setdefault(event, [])
    if not any(json.dumps(item) == json.dumps(entry) for item in bucket):
        bucket.append(entry)
with open(path, "w") as handle:
    json.dump(data, handle, indent=2)
PY

  mkdir -p "$HOME/.claude"
  local MEMORY="$HOME/.claude/CLAUDE.md"
  local BEGIN="<!-- sw:${SLUG} BEGIN -->"
  local END="<!-- sw:${SLUG} END -->"
  if [ -f "$MEMORY" ]; then
    python3 - "$MEMORY" "$BEGIN" "$END" <<'PY'
import re, sys
path, begin, end = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
text = re.sub(re.escape(begin) + r".*?" + re.escape(end) + r"\n?", "", text, flags=re.S)
open(path, "w").write(text)
PY
  fi
  cat >>"$MEMORY" <<EOF
${BEGIN}
The dev server for worktree '${SLUG}' runs in tmux session \`${SLUG}-dev\` (status bar off).
Read its logs without attaching: \`tmux capture-pane -pt ${SLUG}-dev -S -200\`.
Do not run \`bun dev\` yourself — it is already running in that session.
${END}
EOF
  log "ready: $REMOTE_PATH (dragonfly:6379 goaws:9324, DB=neon)"
}

PHASE="${1:-}"
shift || true
case "$PHASE" in
  clone) phase_clone "$@" ;;
  setup) phase_setup "$@" ;;
  *) echo "usage: provision.sh <clone|setup> ..." >&2; exit 1 ;;
esac
