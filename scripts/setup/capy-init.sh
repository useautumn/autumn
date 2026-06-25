#!/usr/bin/env bash
#
# capy-init.sh — one-time install for Capy sandboxes.
#
# Sister script to scripts/dw (which targets a developer's laptop with Docker
# + portless) and scripts/tw/image/build-base.sh (which targets the Vercel
# µVM with dnf). Capy gives us an Ubuntu sandbox with no Docker access to
# Linux containers from inside, so we install the *binaries* the dw stack
# normally runs in containers:
#
#   - Dragonfly  (Redis-protocol, backs REDIS_URL + CACHE_URL +
#                 CACHE_V2_DRAGONFLY_URL — see scripts/dw/helpers/env-files.ts)
#   - goaws      (Go SQS server, FIFO + explicit dedup — drops in for
#                 elasticmq; same shape as scripts/tw/image/build-base.sh)
#   - neonctl    (Neon CLI, needed by scripts/dw/helpers/neon.ts to branch
#                 the dw-template branch per sandbox)
#
# psql 18, bun, node, redis-cli, java, docker, jq, curl, git already ship in
# the Capy snapshot — we don't reinstall them. emulate is fetched at startup
# via bunx so we don't pollute the global install here.
#
# Idempotent. Safe to re-run.
set -euo pipefail

log() { echo "[capy-init] $*"; }
die() { echo "[capy-init] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CAPY_PREFIX="${CAPY_PREFIX:-$HOME/.autumn-capy}"
BIN_DIR="$CAPY_PREFIX/bin"
GOAWS_DIR="$CAPY_PREFIX/goaws"
DRAGONFLY_DIR="$CAPY_PREFIX/dragonfly"
LOG_DIR="$CAPY_PREFIX/logs"
mkdir -p "$BIN_DIR" "$GOAWS_DIR" "$DRAGONFLY_DIR" "$LOG_DIR"

# Versions — mirror scripts/tw/image/build-base.sh so we share the same
# upstream artifacts when both flows coexist on a developer's laptop.
# Pin goaws to a specific tag (not :latest) so re-initialized sandboxes
# stay reproducible — the `if [ ! -x ... ]` guard below makes extraction
# one-shot, so a mutable tag would silently fork binary state across
# sandbox generations.
DRAGONFLY_VERSION="${DRAGONFLY_VERSION:-latest}"
GOAWS_IMAGE="${GOAWS_IMAGE:-docker.io/admiralpiett/goaws:v0.5.4}"
CRANE_VERSION="${CRANE_VERSION:-v0.20.2}"

ARCH="$(uname -m)"

# ---------------------------------------------------------------------------
# 1. Dragonfly (Redis protocol; one process backs all three cache URLs).
# ---------------------------------------------------------------------------
if [ ! -x "$BIN_DIR/dragonfly" ]; then
  case "$ARCH" in
    x86_64) DF_ASSET="dragonfly-x86_64.tar.gz" ;;
    aarch64 | arm64) DF_ASSET="dragonfly-aarch64.tar.gz" ;;
    *) die "unsupported arch for Dragonfly: $ARCH" ;;
  esac
  if [ "$DRAGONFLY_VERSION" = "latest" ]; then
    DF_URL="https://dragonflydb.gateway.scarf.sh/latest/${DF_ASSET}"
  else
    DF_URL="https://github.com/dragonflydb/dragonfly/releases/download/${DRAGONFLY_VERSION}/${DF_ASSET}"
  fi
  log "downloading Dragonfly ($DRAGONFLY_VERSION, $ARCH)"
  TMP_DF="$(mktemp -d)"
  curl -fsSL -o "$TMP_DF/df.tar.gz" "$DF_URL"
  tar -xzf "$TMP_DF/df.tar.gz" -C "$TMP_DF"
  DF_BIN="$(find "$TMP_DF" -type f -name 'dragonfly*' ! -name '*.tar.gz' | head -n1)"
  [ -n "$DF_BIN" ] || die "dragonfly binary not found in archive"
  install -m 0755 "$DF_BIN" "$BIN_DIR/dragonfly"
  rm -rf "$TMP_DF"
fi
log "dragonfly: $BIN_DIR/dragonfly"

# ---------------------------------------------------------------------------
# 2. goaws (native Go SQS server) — extract from the OCI image via `crane`.
# Same approach as scripts/tw/image/build-base.sh §4: the goaws binary only
# ships inside the admiralpiett/goaws image, so we fetch a single static
# `crane` binary, `crane export` the image rootfs, and pull the binary out.
# No Docker daemon required.
# ---------------------------------------------------------------------------
if [ ! -x "$BIN_DIR/goaws" ]; then
  case "$ARCH" in
    x86_64) CR_ARCH="x86_64" ;;
    aarch64 | arm64) CR_ARCH="arm64" ;;
    *) die "unsupported arch for crane/goaws: $ARCH" ;;
  esac
  log "fetching crane $CRANE_VERSION to extract goaws from $GOAWS_IMAGE"
  TMP_GO="$(mktemp -d)"
  curl -fsSL -o "$TMP_GO/crane.tgz" \
    "https://github.com/google/go-containerregistry/releases/download/${CRANE_VERSION}/go-containerregistry_Linux_${CR_ARCH}.tar.gz"
  tar -xzf "$TMP_GO/crane.tgz" -C "$TMP_GO" crane
  "$TMP_GO/crane" export "$GOAWS_IMAGE" "$TMP_GO/goaws-rootfs.tar"
  GOAWS_PATH="$(tar -tf "$TMP_GO/goaws-rootfs.tar" | grep -iE '(^|/)goaws$' | head -n1)"
  [ -n "$GOAWS_PATH" ] || die "goaws binary not found in $GOAWS_IMAGE"
  tar -xf "$TMP_GO/goaws-rootfs.tar" -C "$TMP_GO" "$GOAWS_PATH"
  install -m 0755 "$TMP_GO/$GOAWS_PATH" "$BIN_DIR/goaws"
  rm -rf "$TMP_GO"
fi
log "goaws: $BIN_DIR/goaws"

# goaws config — same shape as scripts/tw/image/build-base.sh: port 9324,
# AccountId 000000000000, FIFO queues with explicit MessageDeduplicationId
# dedup (which is what server/utils/queue/queueUtils.ts always sends).
GOAWS_CONF="$GOAWS_DIR/goaws.yaml"
if [ ! -f "$GOAWS_CONF" ]; then
  cat >"$GOAWS_CONF" <<'EOF'
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
  log "wrote $GOAWS_CONF"
fi

# ---------------------------------------------------------------------------
# 3. neonctl — needed by scripts/dw/helpers/neon.ts (which shells out to
# `neon …`). Install globally via bun; authenticates via NEON_API_KEY
# environment variable (see https://neon.com/docs/reference/neon-cli).
# ---------------------------------------------------------------------------
if ! command -v neon >/dev/null 2>&1 && ! command -v neonctl >/dev/null 2>&1; then
  log "installing neonctl globally via bun"
  bun install -g neonctl >/dev/null
fi

# Surface bun's global bin on PATH so the next shell sees `neon`/`neonctl`.
BUN_GLOBAL_BIN="$(bun pm -g bin 2>/dev/null || echo "$HOME/.bun/bin")"
case ":$PATH:" in
  *":$BUN_GLOBAL_BIN:"*) ;;
  *) export PATH="$BUN_GLOBAL_BIN:$PATH" ;;
esac
log "neonctl: $(command -v neonctl || command -v neon || echo MISSING)"

# ---------------------------------------------------------------------------
# 4. Bun workspace deps. Frozen-lockfile so a stale node_modules from a
# Capy snapshot is repaired without churn.
# ---------------------------------------------------------------------------
log "bun install --frozen-lockfile (workspace deps)"
( cd "$REPO_ROOT" && bun install --frozen-lockfile )

log "init complete — binaries in $BIN_DIR, goaws config $GOAWS_CONF"
