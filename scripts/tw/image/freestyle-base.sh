#!/usr/bin/env bash
# Freestyle-VM analogue of build-base.sh / modalImage.ts: installs the native
# service stack on the VM's Debian (apt) into the exact /opt/autumn-tw layout
# that start-services.sh / stop-services.sh / warmup.sh / boot.ts expect.
# Runs ONCE per cold warm-build; the resulting state lives on in the memory
# snapshot every worker restores from. Assumes the repo is already cloned at
# /repo (bun version is pinned from its .bun-version).
set -euo pipefail

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
REPO_ROOT="${TW_REPO_ROOT:-/repo}"
BIN_DIR="$TW_PREFIX/bin"
PGDATA="$TW_PREFIX/pgdata"
DRAGONFLY_URL="https://dragonflydb.gateway.scarf.sh/latest/dragonfly-x86_64.tar.gz"
CRANE_URL="https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_x86_64.tar.gz"
GOAWS_IMAGE="admiralpiett/goaws:latest"

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"

echo "[freestyle-base] 1/7 base packages"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
	ca-certificates curl wget gnupg bash git xz-utils procps tar gzip \
	locales unzip redis-tools python3 make g++ >/dev/null
mkdir -p "$BIN_DIR" "$TW_PREFIX/logs" "$TW_PREFIX/dragonfly" "$TW_PREFIX/goaws"

echo "[freestyle-base] 2/7 PostgreSQL 18 (PGDG)"
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
	-o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" \
	> /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y -qq --no-install-recommends postgresql-18 postgresql-contrib-18 >/dev/null
# Debian's postinst may auto-start a cluster on 5432 — ours is the only one allowed.
pg_ctlcluster 18 main stop 2>/dev/null || true
systemctl disable --now postgresql 2>/dev/null || true

echo "[freestyle-base] 3/7 Dragonfly"
curl -fsSL -o /tmp/df.tar.gz "$DRAGONFLY_URL"
tar -xzf /tmp/df.tar.gz -C /tmp
install -m0755 "$(find /tmp -maxdepth 1 -type f -name 'dragonfly*' ! -name '*.tar.gz' | head -1)" "$BIN_DIR/dragonfly"
rm -f /tmp/df.tar.gz

echo "[freestyle-base] 4/7 goaws (via crane export, no docker daemon)"
curl -fsSL -o /tmp/crane.tgz "$CRANE_URL"
tar -xzf /tmp/crane.tgz -C /usr/local/bin crane
rm -f /tmp/crane.tgz
crane export "$GOAWS_IMAGE" /tmp/g.tar
GOAWS_BIN="$(tar -tf /tmp/g.tar | grep -iE '(^|/)goaws$' | head -1)"
tar -xf /tmp/g.tar -C /tmp "$GOAWS_BIN"
install -m0755 "/tmp/$GOAWS_BIN" "$BIN_DIR/goaws"
rm -rf /tmp/g.tar

echo "[freestyle-base] 5/7 goaws config"
cat > "$TW_PREFIX/goaws/goaws.yaml" <<'YAML'
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
    - Name: autumn-track-async.fifo
YAML

echo "[freestyle-base] 6/7 bun (pinned to .bun-version) + node symlink"
BUN_VERSION="$(cat "$REPO_ROOT/.bun-version" | tr -d '[:space:]')"
curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" >/dev/null
ln -sf /root/.bun/bin/bun /usr/local/bin/bun
ln -sf /root/.bun/bin/bun /usr/local/bin/node
bun --version
# node-gyp for native-dep install fallbacks (e.g. better-sqlite3's
# `prebuild-install || node-gyp rebuild`) during delta installs.
bun install -g node-gyp >/dev/null
ln -sf /root/.bun/bin/node-gyp /usr/local/bin/node-gyp || true

echo "[freestyle-base] 7/7 initdb PG18 cluster (empty db + pg_trgm)"
export PATH="/usr/lib/postgresql/18/bin:$PATH"
mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA" "$TW_PREFIX/logs" "$TW_PREFIX/dragonfly"
PW="$(mktemp)"; printf postgres > "$PW"; chmod 644 "$PW"
runuser -u postgres -- initdb --pgdata="$PGDATA" --username=postgres \
	--auth-local=trust --auth-host=trust --pwfile="$PW" --encoding=UTF8 >/dev/null
rm -f "$PW"
{
	echo "listen_addresses='localhost'"
	echo "port=5432"
	echo "unix_socket_directories='/tmp'"
	echo "dynamic_shared_memory_type=mmap"
	echo "fsync=off"
	echo "synchronous_commit=off"
	echo "full_page_writes=off"
} >> "$PGDATA/postgresql.conf"
runuser -u postgres -- pg_ctl -D "$PGDATA" -l "$TW_PREFIX/logs/pg.log" -w -o "-p 5432" start
runuser -u postgres -- createdb -h localhost -p 5432 -U postgres autumn
runuser -u postgres -- psql -h localhost -p 5432 -U postgres -d autumn \
	-c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast -w stop

echo "[freestyle-base] done"
