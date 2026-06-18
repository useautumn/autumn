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

log() { echo "[tw-warmup] $*"; }
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
log "Fetching + checking out ref: $REF"
git fetch --quiet --all --tags || log "WARN: git fetch failed (offline?) — using local refs"
git checkout --quiet --force "$REF" || die "git checkout $REF failed"
log "HEAD now at $(git rev-parse --short HEAD)"

# ---------------------------------------------------------------------------
# 2. bun install --frozen-lockfile (delta only — deps baked into base)
# ---------------------------------------------------------------------------
log "bun install --frozen-lockfile"
bun install --frozen-lockfile

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
bun db migrate --bootstrap || die "migration FAILED — aborting warm-up, no workers forked"

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
log "Clean-stopping services for snapshot consistency"
TW_PREFIX="$TW_PREFIX" PG_PORT="$PG_PORT" DRAGONFLY_PORT="$DRAGONFLY_PORT" \
  bash "$SCRIPT_DIR/stop-services.sh"

log "WARM layer ready on ref $(git rev-parse --short HEAD). Snapshot now -> fork N workers."
