#!/usr/bin/env bash
#
# build-base.sh — BASE layer of the `bun tw` µVM image (plan §4a, §5, §5a).
#
# Ref-agnostic, slow-moving, expensive-to-build layers. Installs native
# binaries (NO Docker) on the Vercel µVM (Amazon Linux 2023, dnf):
#   - PostgreSQL 18 + contrib (pg_trgm)
#   - Dragonfly (Redis-protocol cache; backs REDIS_URL + both caches)
#   - elasticmq-native (GraalVM-compiled, no JVM)
#   - ClickHouse (optional; only when TW_INSTALL_CLICKHOUSE=1)
#   - bun
# initdb a PG18 cluster, create role postgres/postgres SUPERUSER, createdb
# autumn, CREATE EXTENSION pg_trgm into an EMPTY db (no tables). bun install
# at repo root. Snapshot of this filesystem becomes the BASE.
#
# Run once per base rebuild (lockfile change / nightly). The per-run WARM
# delta (warmup.sh) sits on top of this.
set -euo pipefail

log() { echo "[tw-build-base] $*"; }
die() { echo "[tw-build-base] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Layout — fixed paths so start/stop/warmup agree without passing args around.
# Override via env for local iteration; defaults match the µVM image.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/tw/image -> repo root is three levels up.
REPO_ROOT="${TW_REPO_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
PGDATA="${PGDATA:-$TW_PREFIX/pgdata}"
DRAGONFLY_DIR="${DRAGONFLY_DIR:-$TW_PREFIX/dragonfly}"
ELASTICMQ_DIR="${ELASTICMQ_DIR:-$TW_PREFIX/elasticmq}"
ELASTICMQ_BIN="${ELASTICMQ_BIN:-$ELASTICMQ_DIR/elasticmq-native-server}"
ELASTICMQ_CONF="${ELASTICMQ_CONF:-$ELASTICMQ_DIR/elasticmq.conf}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"
LOG_DIR="${TW_LOG_DIR:-$TW_PREFIX/logs}"

# Versions — mirror scripts/setup/* and dw.compose.yml.
ELASTICMQ_VERSION="${ELASTICMQ_VERSION:-1.6.11}" # matches agent-bootstrap.sh:110
ELASTICMQ_IMAGE="${ELASTICMQ_IMAGE:-docker.io/softwaremill/elasticmq-native:${ELASTICMQ_VERSION}}"
DRAGONFLY_VERSION="${DRAGONFLY_VERSION:-latest}" # dw uses :latest (dw.compose.yml:10)
INSTALL_CLICKHOUSE="${TW_INSTALL_CLICKHOUSE:-0}"

PG_PORT="${PG_PORT:-5432}"
PG_SUPERUSER="postgres"
PG_PASSWORD="postgres"
DB_NAME="autumn"

mkdir -p "$TW_PREFIX" "$DRAGONFLY_DIR" "$ELASTICMQ_DIR" "$BIN_DIR" "$LOG_DIR"

# ---------------------------------------------------------------------------
# 1. System packages (Amazon Linux 2023 = dnf)
# ---------------------------------------------------------------------------
if ! command -v dnf >/dev/null 2>&1; then
  die "dnf not found — build-base.sh targets Amazon Linux 2023 (the Vercel µVM). See README."
fi

log "Installing base system packages via dnf"
# NOTE: do NOT install `curl` — Amazon Linux 2023 ships `curl-minimal`, which
# already provides /usr/bin/curl and CONFLICTS with the full `curl` package
# (dnf errors out). curl-minimal handles the https downloads below, so use it.
sudo dnf install -y --setopt=install_weak_deps=False \
  tar gzip xz ca-certificates shadow-utils glibc-langpack-en \
  >/dev/null

# ---------------------------------------------------------------------------
# 2. PostgreSQL 18 + contrib (pg_trgm lives in contrib)
# AL2023 ships postgres via its own module/package; install server + contrib.
# ---------------------------------------------------------------------------
if ! command -v initdb >/dev/null 2>&1; then
  log "Installing PostgreSQL 18 + contrib"
  sudo dnf install -y --setopt=install_weak_deps=False \
    postgresql18-server postgresql18-contrib >/dev/null
fi

# AL2023 installs PG binaries under a versioned path; surface them on PATH.
PG_BINDIR=""
for candidate in \
  /usr/pgsql-18/bin \
  /usr/lib/postgresql/18/bin \
  /usr/bin; do
  if [ -x "$candidate/initdb" ]; then
    PG_BINDIR="$candidate"
    break
  fi
done
[ -n "$PG_BINDIR" ] || die "could not locate PostgreSQL 18 binaries (initdb)"
export PATH="$PG_BINDIR:$PATH"
log "Using PostgreSQL binaries at $PG_BINDIR ($("$PG_BINDIR/initdb" --version))"

# ---------------------------------------------------------------------------
# 3. Dragonfly (native binary, Redis protocol). One instance backs REDIS_URL,
#    CACHE_URL and CACHE_V2_DRAGONFLY_URL (plan §5a port note).
# ---------------------------------------------------------------------------
if [ ! -x "$BIN_DIR/dragonfly" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) DF_ASSET="dragonfly-x86_64.tar.gz" ;;
    aarch64 | arm64) DF_ASSET="dragonfly-aarch64.tar.gz" ;;
    *) die "unsupported arch for Dragonfly: $ARCH" ;;
  esac
  DF_URL="https://dragonflydb.gateway.scarf.sh/latest/${DF_ASSET}"
  if [ "$DRAGONFLY_VERSION" != "latest" ]; then
    DF_URL="https://github.com/dragonflydb/dragonfly/releases/download/${DRAGONFLY_VERSION}/${DF_ASSET}"
  fi
  log "Downloading Dragonfly ($DRAGONFLY_VERSION, $ARCH)"
  TMP_DF="$(mktemp -d)"
  curl -fsSL -o "$TMP_DF/df.tar.gz" "$DF_URL"
  tar -xzf "$TMP_DF/df.tar.gz" -C "$TMP_DF"
  # Archive contains a `dragonfly-<arch>` binary; normalize the name.
  DF_EXTRACTED="$(find "$TMP_DF" -type f -name 'dragonfly*' ! -name '*.tar.gz' | head -n1)"
  [ -n "$DF_EXTRACTED" ] || die "dragonfly binary not found in archive"
  install -m 0755 "$DF_EXTRACTED" "$BIN_DIR/dragonfly"
  rm -rf "$TMP_DF"
fi
log "Dragonfly installed at $BIN_DIR/dragonfly"

# redis-cli — Dragonfly speaks the Redis protocol but ships NO client. The
# readiness probes (PING), the clean-stop (SAVE/SHUTDOWN), and the spike's verify
# all need `redis-cli`. AL2023 packages it as `redis6` (binary redis6-cli);
# symlink it to `redis-cli` on BIN_DIR (which start-services puts on PATH).
if ! command -v redis-cli >/dev/null 2>&1 && [ ! -x "$BIN_DIR/redis-cli" ]; then
  log "Installing redis-cli (redis6)"
  sudo dnf install -y --setopt=install_weak_deps=False redis6 >/dev/null 2>&1 \
    || log "WARN: dnf install redis6 failed"
  REDIS_CLI_BIN="$(command -v redis6-cli 2>/dev/null || command -v redis-cli 2>/dev/null || true)"
  if [ -n "$REDIS_CLI_BIN" ]; then
    ln -sf "$REDIS_CLI_BIN" "$BIN_DIR/redis-cli"
    log "redis-cli -> $REDIS_CLI_BIN"
  else
    die "redis-cli not found after installing redis6 (Dragonfly probes need it)"
  fi
fi

# ---------------------------------------------------------------------------
# 4. elasticmq-native (GraalVM static binary — NOT the JVM jar).
# It is published ONLY inside the softwaremill/elasticmq-native image at
# /opt/elasticmq/bin/elasticmq-native-server (native-server/Dockerfile,
# verified). There is no standalone GitHub release asset for the native build,
# so we extract the binary from the OCI image WITHOUT a Docker daemon, using
# `crane` (preferred) or `skopeo`. Fall back to the JVM jar only if neither is
# present (so the build never hard-fails on a fresh box during iteration).
# ---------------------------------------------------------------------------
install_elasticmq_native() {
  local tool="$1"
  local oci_dir tar_dir
  oci_dir="$(mktemp -d)"
  tar_dir="$(mktemp -d)"
  log "Extracting elasticmq-native binary from $ELASTICMQ_IMAGE via $tool"
  case "$tool" in
    crane)
      # crane export flattens the image filesystem into a single tar.
      crane export "$ELASTICMQ_IMAGE" "$oci_dir/rootfs.tar"
      ;;
    skopeo)
      skopeo copy "docker://$ELASTICMQ_IMAGE" "oci:$oci_dir/oci:latest"
      # Flatten OCI layers into a rootfs tar via `umoci` if present, else bail.
      command -v umoci >/dev/null 2>&1 \
        || die "skopeo copy succeeded but umoci missing to unpack layers"
      umoci unpack --image "$oci_dir/oci:latest" "$oci_dir/bundle"
      tar -C "$oci_dir/bundle/rootfs" -cf "$oci_dir/rootfs.tar" .
      ;;
    *) return 1 ;;
  esac
  tar -xf "$oci_dir/rootfs.tar" -C "$tar_dir" opt/elasticmq/bin/elasticmq-native-server
  install -m 0755 "$tar_dir/opt/elasticmq/bin/elasticmq-native-server" "$ELASTICMQ_BIN"
  rm -rf "$oci_dir" "$tar_dir"
}

install_elasticmq_jar_fallback() {
  log "Installing elasticmq via JVM jar (needs java at runtime)"
  sudo dnf install -y --setopt=install_weak_deps=False java-17-amazon-corretto-headless >/dev/null
  curl -fsSL -o "$ELASTICMQ_DIR/elasticmq.jar" \
    "https://s3-eu-west-1.amazonaws.com/softwaremill-public/elasticmq-server-${ELASTICMQ_VERSION}.jar"
  log "Wrote JVM jar to $ELASTICMQ_DIR/elasticmq.jar (start-services.sh detects it)"
}

export PATH="$BIN_DIR:$PATH"

# elasticmq: the GraalVM native binary extracted from the OCI image does NOT run
# standalone in the µVM (it crashes with an empty log — missing shared libs /
# resources that only exist inside the full image). The JVM jar is reliable
# (needs only java, installed below), so use it. A self-contained native SQS is
# a follow-up; `install_elasticmq_native` is kept above for that future work.
if [ ! -f "$ELASTICMQ_DIR/elasticmq.jar" ] && [ ! -x "$ELASTICMQ_BIN" ]; then
  install_elasticmq_jar_fallback
fi

# Place the elasticmq config declaring BOTH FIFO queues (mirrors
# scripts/setup/elasticmq.conf:18-27). Host bound to 0.0.0.0/localhost so the
# server reaches it over localhost.
cat >"$ELASTICMQ_CONF" <<'EOF'
include classpath("application.conf")

node-address {
  protocol = http
  host = "localhost"
  port = 9324
  context-path = ""
}

rest-sqs {
  enabled = true
  bind-port = 9324
  bind-hostname = "0.0.0.0"
  sqs-limits = strict
}

generate-node-address = false

queues {
  "autumn.fifo" {
    fifo = true
    contentBasedDeduplication = true
  }
  "autumn-track.fifo" {
    fifo = true
    contentBasedDeduplication = true
  }
}
EOF
log "Wrote elasticmq config to $ELASTICMQ_CONF (autumn.fifo + autumn-track.fifo)"

# ---------------------------------------------------------------------------
# 5. ClickHouse (optional — only when analytics tests are in scope).
# ---------------------------------------------------------------------------
if [ "$INSTALL_CLICKHOUSE" = "1" ]; then
  if ! command -v clickhouse >/dev/null 2>&1 && [ ! -x "$BIN_DIR/clickhouse" ]; then
    log "Installing ClickHouse (single static binary)"
    TMP_CH="$(mktemp -d)"
    ( cd "$TMP_CH" && curl -fsSL https://clickhouse.com/ | sh )
    install -m 0755 "$TMP_CH/clickhouse" "$BIN_DIR/clickhouse"
    rm -rf "$TMP_CH"
  fi
  log "ClickHouse installed at $BIN_DIR/clickhouse"
else
  log "Skipping ClickHouse (set TW_INSTALL_CLICKHOUSE=1 to include analytics tests)"
fi

# ---------------------------------------------------------------------------
# 6. bun
# ---------------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  log "Installing bun"
  curl -fsSL https://bun.sh/install | bash
fi
# bun installs to ~/.bun/bin; surface it for the rest of this script.
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 || die "bun not on PATH after install"
log "bun $(bun --version)"

# ---------------------------------------------------------------------------
# 7. initdb a PG18 cluster, role postgres/postgres SUPERUSER, createdb autumn,
#    CREATE EXTENSION pg_trgm into an EMPTY db (NO application tables).
#    Mirrors neon.ts:173 template seed + agent-services.sh:74-87.
# ---------------------------------------------------------------------------
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "initdb PG18 cluster at $PGDATA (superuser=$PG_SUPERUSER)"
  PWFILE="$(mktemp)"
  printf '%s' "$PG_PASSWORD" >"$PWFILE"
  initdb \
    --pgdata="$PGDATA" \
    --username="$PG_SUPERUSER" \
    --auth-local=trust \
    --auth-host=trust \
    --pwfile="$PWFILE" \
    --encoding=UTF8 \
    >/dev/null
  rm -f "$PWFILE"
  # Listen on localhost only; the µVM exposes only the server port.
  {
    echo "listen_addresses = 'localhost'"
    echo "port = $PG_PORT"
    # Minimal µVMs lack /run/postgresql and have a tiny /dev/shm; point the
    # socket at /tmp and use mmap DSM so startup doesn't depend on either.
    echo "unix_socket_directories = '/tmp'"
    echo "dynamic_shared_memory_type = mmap"
    echo "fsync = off"            # ephemeral test DB — durability not needed, faster
    echo "synchronous_commit = off"
    echo "full_page_writes = off"
  } >>"$PGDATA/postgresql.conf"
else
  log "PG cluster already initialized at $PGDATA"
fi

# Start PG transiently to create the db + extension, then clean-stop.
log "Starting PG transiently to create db '$DB_NAME' + pg_trgm"
pg_ctl -D "$PGDATA" -l "$LOG_DIR/pg.log" -w -o "-p $PG_PORT" start || {
  echo "[tw-build-base] ERROR: PG failed to start — pg.log follows:" >&2
  cat "$LOG_DIR/pg.log" >&2 2>/dev/null || true
  exit 1
}

createdb_if_missing() {
  if ! psql -h localhost -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    createdb -h localhost -p "$PG_PORT" -U "$PG_SUPERUSER" "$DB_NAME"
    log "created db $DB_NAME"
  fi
}
createdb_if_missing

# pg_trgm MUST exist BEFORE migrate — 0000_bumpy_tinkerer.sql:835-880 creates
# gin_trgm_ops indexes but does NOT create the extension (plan §5a gotcha 1).
psql -h localhost -p "$PG_PORT" -U "$PG_SUPERUSER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
log "ensured CREATE EXTENSION pg_trgm on empty db (NO tables)"

log "Clean-stopping PG (-m fast) for a consistent base"
pg_ctl -D "$PGDATA" -m fast -w stop

# ---------------------------------------------------------------------------
# 8. bun install at repo root (warmed node_modules baked into BASE).
# ---------------------------------------------------------------------------
log "bun install at repo root ($REPO_ROOT)"
( cd "$REPO_ROOT" && bun install --frozen-lockfile )

log "BASE layer built. Paths: PGDATA=$PGDATA, BIN_DIR=$BIN_DIR, ELASTICMQ_CONF=$ELASTICMQ_CONF"
log "Next: snapshot this filesystem -> base snapshot. Then warmup.sh per run."
