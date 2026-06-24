#!/usr/bin/env bash
#
# provision.sh — runs ON the exe.dev devbox to stand up a long-lived autumn dev
# worktree with NATIVE services (no Docker): Dragonfly + goaws, the same engines
# as `bun tw`. PostgreSQL is intentionally absent — the box uses a Neon branch
# (issued from the Mac) so the DB survives box rebuilds. Idempotent: re-running is
# a fast no-op once everything is in place.
#
# Args (positional, all shell-quoted by the caller):
#   $1 REMOTE_PATH   absolute checkout path on the box
#   $2 BRANCH        git branch to check out
#   $3 ORIGIN        ssh origin url (cloned via forwarded ssh-agent)
#   $4 DATABASE_URL  Neon branch connection string
#   $5 SLUG          worktree slug (tmux session = <slug>-dev)
#   $6 HOOK_SRC      path to the vendored herdr claude status hook (uploaded)
#   $7 BASE_ENV      path to the infisical dotenv export (uploaded)
set -euo pipefail

REMOTE_PATH="$1"; BRANCH="$2"; ORIGIN="$3"; DATABASE_URL="$4"
SLUG="$5"; HOOK_SRC="$6"; BASE_ENV="$7"

log() { echo "[sw-provision] $*"; }

BIN_DIR="$HOME/.local/bin"
SW_DIR="$HOME/.config/sw"
LOG_DIR="$HOME/.local/state/sw/logs"
mkdir -p "$BIN_DIR" "$SW_DIR" "$LOG_DIR"
export PATH="$BIN_DIR:$HOME/.bun/bin:$PATH"

case "$(uname -m)" in
  x86_64) GOAWS_ARCH="x86_64"; DF_ARCH="x86_64" ;;
  aarch64 | arm64) GOAWS_ARCH="arm64"; DF_ARCH="aarch64" ;;
  *) echo "[sw-provision] unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------------------
# 1. Base packages (apt) + bun + lazygit + global npm tools + claude.
# ---------------------------------------------------------------------------
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
  LG_ARCH=$([ "$GOAWS_ARCH" = "arm64" ] && echo arm64 || echo x86_64)
  curl -fsSL "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_$(curl -fsSL https://api.github.com/repos/jesseduffield/lazygit/releases/latest | jq -r .tag_name | sed 's/^v//')_Linux_${LG_ARCH}.tar.gz" \
    -o /tmp/lazygit.tar.gz && tar -xzf /tmp/lazygit.tar.gz -C "$BIN_DIR" lazygit && rm -f /tmp/lazygit.tar.gz
fi

log "installing @sirtenzin/hunks + claude code (bun global)"
bun add -g @sirtenzin/hunks @anthropic-ai/claude-code >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 2. Native SQS (goaws) + cache (Dragonfly) — release binaries, no Docker.
# ---------------------------------------------------------------------------
if [ ! -x "$BIN_DIR/goaws" ]; then
  log "installing goaws ($GOAWS_ARCH)"
  curl -fsSL "https://github.com/Admiral-Piett/goaws/releases/latest/download/goaws_Linux_${GOAWS_ARCH}.tar.gz" \
    -o /tmp/goaws.tar.gz
  tar -xzf /tmp/goaws.tar.gz -C "$BIN_DIR" goaws && rm -f /tmp/goaws.tar.gz
fi

if [ ! -x "$BIN_DIR/dragonfly" ]; then
  log "installing dragonfly ($DF_ARCH)"
  curl -fsSL "https://github.com/dragonflydb/dragonfly/releases/latest/download/dragonfly-${DF_ARCH}.tar.gz" \
    -o /tmp/dragonfly.tar.gz
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

# ---------------------------------------------------------------------------
# 3. sshd: allow the herdr status-hook socket to be reverse-forwarded over ssh.
# ---------------------------------------------------------------------------
if [ -d /etc/ssh/sshd_config.d ] && [ ! -f /etc/ssh/sshd_config.d/sw-herdr.conf ]; then
  log "enabling unix-socket forwarding in sshd"
  printf 'AllowStreamLocalForwarding yes\nStreamLocalBindUnlink yes\n' \
    | sudo tee /etc/ssh/sshd_config.d/sw-herdr.conf >/dev/null
  sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 4. Clone (or update) the worktree, install deps.
# ---------------------------------------------------------------------------
if [ ! -d "$REMOTE_PATH/.git" ]; then
  log "cloning $ORIGIN ($BRANCH) -> $REMOTE_PATH"
  mkdir -p "$(dirname "$REMOTE_PATH")"
  GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
    git clone --branch "$BRANCH" "$ORIGIN" "$REMOTE_PATH"
else
  log "updating existing checkout"
  git -C "$REMOTE_PATH" fetch origin "$BRANCH" --quiet || true
  git -C "$REMOTE_PATH" checkout "$BRANCH" --quiet || true
fi

log "installing deps (bun install)"
(cd "$REMOTE_PATH" && bun install --frozen-lockfile >/dev/null 2>&1) || \
  (cd "$REMOTE_PATH" && bun install >/dev/null 2>&1) || true

# ---------------------------------------------------------------------------
# 5. Env: infisical export (base) + per-worktree native-service overrides.
# ---------------------------------------------------------------------------
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
( cd "$REMOTE_PATH" && set -a && DATABASE_URL="$DATABASE_URL" bun run db:migrate >/dev/null 2>&1 ) || true

# ---------------------------------------------------------------------------
# 6. Claude: status hook (→ herdr over the forwarded socket) + agent memory.
# ---------------------------------------------------------------------------
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

# Tell the on-box agent where the dev server lives (managed block; XDG user memory).
mkdir -p "$HOME/.claude"
MEMORY="$HOME/.claude/CLAUDE.md"
BEGIN="<!-- sw:${SLUG} BEGIN -->"
END="<!-- sw:${SLUG} END -->"
if [ -f "$MEMORY" ]; then
  python3 - "$MEMORY" "$BEGIN" "$END" <<'PY'
import sys
path, begin, end = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
import re
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
