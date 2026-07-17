#!/usr/bin/env bash
#
# warmup.sh — the per-run WARM layer (plan §4b, §5a "WARM snapshot", §9 step 3).
#
# Runs ON TOP of the BASE snapshot, on the exact git ref under test, in this
# precise order (the ordering is load-bearing — see plan §5a gotchas):
#   1. git checkout <ref>
#   2. bun install --frozen-lockfile        (delta only; deps baked in base)
#   3. bun db migrate --bootstrap            (tables + trgm indexes, ONCE)
#   4. bun migrate-functions                 (10 SQL procs in dependency order)
#   5. seed org/features/products/key        (setup-test, createStripeAccount OFF)
#   6. clean-stop services                   (consistent filesystem snapshot)
#
# If migrate fails, this aborts — workers are never forked (plan §4b step 3,
# the "don't get wrecked ×1000" property). DB ops bypass Infisical via
# AUTUMN_DB_DIRECT=1 + a localhost DATABASE_URL (no secrets in the µVM).
set -euo pipefail

# SECONDS-since-start prefix so the run log doubles as a stage profile.
log() { echo "[tw-warmup] +${SECONDS}s $*"; }
die() { echo "[tw-warmup] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TW_REPO_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

TW_PREFIX="${TW_PREFIX:-/opt/autumn-tw}"
PG_PORT="${PG_PORT:-5432}"
DRAGONFLY_PORT="${DRAGONFLY_PORT:-6379}"
ELASTICMQ_PORT="${ELASTICMQ_PORT:-9324}"
BIN_DIR="${TW_BIN_DIR:-$TW_PREFIX/bin}"

# The ref under test. Defaults to current HEAD when not passed (plan §8.6:
# --ref defaults to HEAD). First positional arg or TW_REF env.
REF="${1:-${TW_REF:-HEAD}}"
# The commit the caller resolved REF to (the warm image is named after it).
# When set, checkout MUST land on it — a mismatch aborts the whole warm build.
EXPECTED_HEAD="${2:-${TW_EXPECTED_HEAD:-}}"

export PATH="$HOME/.bun/bin:$BIN_DIR:$PATH"
command -v bun >/dev/null 2>&1 || die "bun not on PATH (run build-base.sh)"

# ---------------------------------------------------------------------------
# Localhost service URLs (plan §5a / §11a). All point at the µVM's own daemons;
# DATABASE_CRITICAL_URL equals DATABASE_URL. Exported so the seed + migrate
# steps inherit them without an Infisical wrap.
# ---------------------------------------------------------------------------
export DATABASE_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/autumn"
export DATABASE_CRITICAL_URL="$DATABASE_URL"
export REDIS_URL="redis://localhost:${DRAGONFLY_PORT}"
export CACHE_URL="$REDIS_URL"
export CACHE_V2_DRAGONFLY_URL="$REDIS_URL"
export SQS_QUEUE_URL_V2="http://localhost:${ELASTICMQ_PORT}/000000000000/autumn.fifo"
export TRACK_SQS_QUEUE_URL="http://localhost:${ELASTICMQ_PORT}/000000000000/autumn-track.fifo"
export TRACK_ASYNC_SQS_QUEUE_URL="http://localhost:${ELASTICMQ_PORT}/000000000000/autumn-track-async.fifo"

# Bypass Infisical for all DB CLI ops (env.ts:66-74): direct mode requires
# DATABASE_URL injected, which we just set.
export AUTUMN_DB_DIRECT=1
# Single-process dev path so feature-guarded services degrade instead of
# blocking boot, and skip-verify stays on (plan §11a, §6a gotcha a).
export NODE_ENV="${NODE_ENV:-development}"
# Worker-mode flag: gates the warm-parent seed to createStripeAccount:false so
# the warm snapshot bakes org/features/products/keys but NO Stripe sub-account
# (plan §5a step 5, §6a "Warm-parent change"). The per-worker
# attachSandboxStripeAccount mints the sub-account at boot. The createTestOrg
# refactor (separate module) reads this flag to flip createStripeAccount.
export TW_SKIP_STRIPE_ACCOUNT=true
export TW_WORKER_MODE=1

cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. git checkout <ref>
# ---------------------------------------------------------------------------
log "Ensuring working tree is at ref: $REF${EXPECTED_HEAD:+ (expect $EXPECTED_HEAD)}"
if [ -n "$EXPECTED_HEAD" ] \
  && [ "$(git rev-parse HEAD | cut -c1-${#EXPECTED_HEAD})" = "$EXPECTED_HEAD" ]; then
  # The provider's fast-forward checkout already put us on the exact commit;
  # re-resolving the branch here could revert onto a stale local ref.
  log "working tree already at expected commit — skipping checkout"
else
  git fetch --quiet --all --tags \
    || log "WARN: git fetch failed (offline / shallow clone) — using what's checked out"
  # Prefer origin's tip: fast-forward base images carry a STALE local branch,
  # so refs/heads/$REF can be behind origin/$REF and must not win.
  # Vercel clones the `revision` in a DETACHED state with no local branch, so a
  # plain `git checkout <branch>` fails ("pathspec did not match"). Resolve the ref
  # however it exists; if it's not a branch/tag/remote ref, the clone is
  # already AT it (Vercel checked out the revision at create) — just proceed.
  if git rev-parse --verify --quiet "refs/remotes/origin/$REF" >/dev/null 2>&1; then
    git checkout --quiet --force -B "$REF" "origin/$REF"
  elif git rev-parse --verify --quiet "refs/heads/$REF" >/dev/null 2>&1; then
    git checkout --quiet --force "$REF"
  elif git rev-parse --verify --quiet "$REF" >/dev/null 2>&1; then
    git checkout --quiet --force "$REF"
  else
    log "ref '$REF' is not a local branch/tag — assuming the clone is already at it"
  fi
fi
log "HEAD at $(git rev-parse --short HEAD)"
if [ -n "$EXPECTED_HEAD" ]; then
  ACTUAL_HEAD="$(git rev-parse HEAD)"
  case "$ACTUAL_HEAD" in
    "$EXPECTED_HEAD"*) ;;
    *) die "HEAD $ACTUAL_HEAD != expected $EXPECTED_HEAD — refusing to build a stale warm" ;;
  esac
fi

# ---------------------------------------------------------------------------
# 2. bun install --frozen-lockfile (delta only — deps baked into base)
# ---------------------------------------------------------------------------
# Even a no-op frozen install costs ~65s (relink scan of ~350k files), so skip
# it entirely when the lockfile hash matches the stamp from the last install.
LOCK_FILE=""
for candidate in bun.lock bun.lockb package-lock.json; do
  [ -f "$candidate" ] && LOCK_FILE="$candidate" && break
done
LOCK_STAMP="$TW_PREFIX/bun-lock.sha256"
LOCK_HASH=""
if [ -n "$LOCK_FILE" ] && command -v sha256sum >/dev/null 2>&1; then
  LOCK_HASH="$(sha256sum "$LOCK_FILE" | cut -d' ' -f1)"
fi
if [ -n "$LOCK_HASH" ] && [ -f "$LOCK_STAMP" ] \
  && [ "$(cat "$LOCK_STAMP")" = "$LOCK_HASH" ]; then
  log "lockfile unchanged ($LOCK_FILE) — skipping bun install"
else
  log "bun install --frozen-lockfile"
  # Self-repair: a failing lifecycle script (native-dep rebuild on a delta
  # install) must not abort the warm-up — deps land, optional builds are skipped.
  if ! bun install --frozen-lockfile; then
    log "install failed — retrying with --ignore-scripts"
    bun install --frozen-lockfile --ignore-scripts \
      || die "bun install FAILED even with --ignore-scripts"
  fi
  if [ -n "$LOCK_HASH" ]; then
    echo "$LOCK_HASH" > "$LOCK_STAMP"
  fi
fi

# ---------------------------------------------------------------------------
# Ensure services are up for migrate + seed (idempotent).
# ---------------------------------------------------------------------------
log "Starting services for migrate + seed"
TW_PREFIX="$TW_PREFIX" PG_PORT="$PG_PORT" DRAGONFLY_PORT="$DRAGONFLY_PORT" \
  ELASTICMQ_PORT="$ELASTICMQ_PORT" bash "$SCRIPT_DIR/start-services.sh"

# ---------------------------------------------------------------------------
# 3. Migrate (tables + trgm indexes). --bootstrap skips the CONCURRENTLY-index
#    guard (required for the 0000 baseline; migrate.ts:34-38). FAIL-FAST: any
#    non-zero exit aborts the whole warm-up before any worker is forked.
# ---------------------------------------------------------------------------
log "bun db migrate --bootstrap (DATABASE_URL=localhost autumn)"
# Self-repair: on ANY migrate error (e.g. journal/DB drift on a fast-forwarded
# warm base), drop the throwaway DB and bootstrap from zero instead of dying.
if ! bun db migrate --bootstrap; then
  log "migrate failed — self-repair: dropping DB and bootstrapping from zero"
  for candidate in /usr/pgsql-18/bin /usr/lib/postgresql/18/bin /usr/bin; do
    [ -x "$candidate/dropdb" ] && export PATH="$candidate:$PATH" && break
  done
  export PGPASSWORD=postgres
  dropdb -h localhost -p "$PG_PORT" -U postgres --if-exists autumn \
    || die "self-repair dropdb FAILED"
  createdb -h localhost -p "$PG_PORT" -U postgres autumn \
    || die "self-repair createdb FAILED"
  psql -h localhost -p "$PG_PORT" -U postgres -d autumn \
    -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;' >/dev/null \
    || die "self-repair pg_trgm FAILED"
  bun db migrate --bootstrap \
    || die "migration FAILED even after DB rebuild — aborting warm-up"
fi

# ---------------------------------------------------------------------------
# 4. Load DB functions (separate step!). 10 SQL procs in dependency order
#    (initializeDatabaseFunctions). Migrations do NOT install these.
# ---------------------------------------------------------------------------
log "bun migrate-functions (SQL procedures)"
# Run the underlying script directly so it inherits our localhost DATABASE_URL
# instead of the package.json wrapper's `infisical run --env=dev`.
bun scripts/migrations/migrate-functions.ts || die "migrate-functions FAILED"

# ---------------------------------------------------------------------------
# 5. Seed shared org/features/products/key (createStripeAccount disabled via
#    TW_WORKER_MODE). --yes skips the interactive confirm. This bakes the
#    identical-across-workers DB state into the warm snapshot.
# ---------------------------------------------------------------------------
log "Seeding test org (setup-test, createStripeAccount disabled)"
bun scripts/setup/setup-test.ts --yes || die "setup-test seed FAILED"

# ---------------------------------------------------------------------------
# 6. Clean-stop services for a snapshot-consistent filesystem (plan §5a step 6).
# ---------------------------------------------------------------------------
if [ "${TW_SKIP_CLEAN_STOP:-}" = "1" ]; then
  log "TW_SKIP_CLEAN_STOP=1 — leaving services running (worker fast-forward path)"
else
  log "Clean-stopping services for snapshot consistency"
  TW_PREFIX="$TW_PREFIX" PG_PORT="$PG_PORT" DRAGONFLY_PORT="$DRAGONFLY_PORT" \
    bash "$SCRIPT_DIR/stop-services.sh"
fi

log "WARM layer ready on ref $(git rev-parse --short HEAD). Snapshot now -> fork N workers."
