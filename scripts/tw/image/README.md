# `bun tw` µVM image scripts (native, NO Docker)

These four bash scripts build and run the per-worker Autumn stack **as native
binaries on the Vercel Sandbox µVM** — Firecracker microVM, **Amazon Linux 2023
(`dnf`)**, full root + `sudo`, no Docker. They are the on-VM half of the cloud
test swarm; the orchestrator (`scripts/tw/index.ts`, separate module) forks
sandboxes and invokes these.

> **These scripts run on the µVM, not your Mac.** The dev box is macOS/brew
> (`scripts/setup/agent-services.sh`); the µVM is AL2023/dnf. `build-base.sh`
> hard-errors if `dnf` is missing. **They need live iteration** against a real
> Vercel Sandbox — exact AL2023 package names (`postgresql18-server`,
> `postgresql18-contrib`), the PG bin path, the Dragonfly release asset URL, and
> the elasticmq-native extraction path are best-effort and must be verified on a
> real µVM during the §14 one-worker spike.

## Script → plan section map

| Script | Layer | Plan sections | What it does |
|---|---|---|---|
| `build-base.sh` | BASE (ref-agnostic) | §4a, §5, §5a "BASE snapshot" | Installs native PG18 + contrib (`pg_trgm`), Dragonfly, elasticmq-native (GraalVM binary, **not** the JVM jar), optional ClickHouse, and bun. `initdb` a PG18 cluster, role `postgres/postgres` SUPERUSER, `createdb autumn`, `CREATE EXTENSION pg_trgm` into an **empty** DB (no tables). Places `elasticmq.conf` declaring `autumn.fifo` + `autumn-track.fifo`. `bun install` at repo root. |
| `start-services.sh` | base build + worker boot | §5, §5a, §4c | Starts PG (`pg_ctl`), Dragonfly (`--dir` snapshot path, `:6380`), elasticmq-native (`:9324`, `-Dconfig.file`), Tinybird Local (supervisord, `:7181`, Modal image only), optional ClickHouse (`:8123`), in background. Idempotent (PING/probe gate per service). |
| `deploy-tinybird-local.sh` | WARM (per-run, on the ref) | — | Deploys `server/tinybird` (datasources + materializations + API pipes; the S3 sink + PG backfill copies are excluded — they need cloud secrets) to Tinybird Local via the baked `tb` CLI, authenticated with the instance's own `/tokens` workspace admin token. |
| `stop-services.sh` | warm build, pre-snapshot | §5a step 6, §4b step 5 | CLEAN-STOP for snapshot consistency: `pg_ctl -m fast stop -w`; Dragonfly `SAVE` then `SHUTDOWN NOSAVE`; SIGTERM elasticmq. Filesystem-only snapshots mean process memory is lost, so state must be flushed to disk. |
| `warmup.sh` | WARM (per-run, on the ref) | §4b, §5a "WARM snapshot", §9 step 3 | `git checkout <ref>` → `bun install --frozen-lockfile` → `bun db migrate --bootstrap` (fail-fast) → `bun migrate-functions` → seed via `setup-test` (Stripe disabled) → `stop-services.sh`. |

## Order (per the plan)

1. **Base build (once / on lockfile change / nightly):** `build-base.sh`, then
   the orchestrator snapshots the filesystem → base snapshot.
2. **Warm build (every `bun tw`, on the ref under test):** fork base →
   `warmup.sh <ref>` → orchestrator snapshots → warm snapshot.
3. **Worker boot (×N forks):** `start-services.sh` (services cold-start against
   the baked, migrated data dir — **no re-migration**) → orchestrator attaches
   the Stripe sub-account + webhook (`attachSandboxStripeAccount`, §6a) → ready.

## Fixed paths & ports (override via env for local iteration)

- `TW_PREFIX=/opt/autumn-tw` — root for `pgdata/`, `dragonfly/`, `elasticmq/`,
  `bin/`, `logs/`.
- PG `:5432`, Dragonfly `:6380` (backs `REDIS_URL` + `CACHE_URL` +
  `CACHE_V2_DRAGONFLY_URL` — one instance, plan §5a port note; `:6379` belongs
  to Tinybird Local's Redis), elasticmq `:9324`, Tinybird Local `:7181`,
  ClickHouse `:8123` (Tinybird's own on the Modal image). No dw
  `+(worktreeNum-1)*100` offset — each worker is its own µVM, so base ports are
  used directly.

## Key decisions / assumptions (verify on the µVM)

- **elasticmq-native binary source.** The GraalVM `--static` native binary
  (`elasticmq-native-server`) is published **only** inside the
  `softwaremill/elasticmq-native` Docker image at
  `/opt/elasticmq/bin/elasticmq-native-server` (verified from the repo's
  `native-server/Dockerfile`); there is no standalone GitHub release asset for
  it (releases ship only the JVM `elasticmq-server-*.jar`). `build-base.sh`
  therefore extracts the binary from the OCI image **without a Docker daemon**
  via `crane export` (preferred) or `skopeo` + `umoci`, and **falls back to the
  JVM jar + Corretto** only if neither tool is present. To honor "native, no
  JVM", ensure `crane` is on the µVM. `start-services.sh`/`stop-services.sh`
  handle both the native binary and the jar fallback.
- **ClickHouse is optional** — gated behind `TW_INSTALL_CLICKHOUSE=1` (build)
  and `TW_START_CLICKHOUSE=1` (start). Only needed for analytics tests, and
  mutually exclusive with Tinybird Local (both bind `:8123`).
- **Tinybird Local is Modal-only.** The Modal base image (`modalImage.ts`) is
  built FROM `tinybirdco/tinybird-local` (Ubuntu 22.04), so the whole Tinybird
  stack (ClickHouse, Redis `:6379`, nginx API `:7181`, tinybird_server, HFI
  events API) ships as supervisord programs — the only daemon-less way to run
  Tinybird in a sandbox. `warmup.sh` deploys the ref's `server/tinybird` schema
  ONCE (WARM layer) via `deploy-tinybird-local.sh`; workers cold-start the
  already-deployed instance and `worker/boot.ts` wires
  `TINYBIRD_US_EAST_API_URL`/`_TOKEN` from `/tokens`. The Vercel build-base.sh
  path has no Tinybird — the `auto` gates in start/stop/warmup skip it there
  (Tinybird-dependent tests still fail on that provider).
- **Migrate bypasses Infisical.** `warmup.sh` exports a localhost
  `DATABASE_URL` + `AUTUMN_DB_DIRECT=1`, which `scripts/db/helpers/env.ts:66-74`
  honors to skip the `infisical run` wrap. `bun migrate-functions` is invoked as
  the raw `scripts/migrations/migrate-functions.ts` (not the package.json
  wrapper, which prepends `infisical run --env=dev`).
- **No `server/.env` on the image.** Per plan §11a, env arrives via
  `preload-env.ts` → `loadLocalEnv()` reading `server/.env`. On a clean µVM that
  file does not exist (it's an Infisical/`bun dw` artifact, not committed), so
  dotenv no-ops and `warmup.sh`'s exported localhost `DATABASE_URL` stands. If a
  future image bakes a `server/.env` with a `DATABASE_URL`, it would override —
  keep that file absent (the 6 hard-gate secrets are injected as fork `env`,
  plan §11a, not via `.env`).
- **`createStripeAccount: false` gate.** `warmup.sh` exports `TW_WORKER_MODE=1`.
  The `createTestOrg` refactor (plan §6a "Warm-parent change", a **separate
  module**) reads this flag to flip `createStripeAccount` off so the warm
  snapshot bakes org/features/products/keys but **no** Stripe sub-account; the
  per-worker `attachSandboxStripeAccount` mints it at boot. If that refactor
  lands under a different flag name, update the export in `warmup.sh`.
- **`NODE_ENV` must not be `production`** (plan §6a gotcha a) — `warmup.sh` sets
  `development` so skip-verify stays on and feature-guarded services degrade
  instead of blocking boot.
- **PG durability is off** (`fsync`/`synchronous_commit`/`full_page_writes`
  off) — the DB is ephemeral test state, so this is a safe speedup; the
  clean-stop still checkpoints to disk for the snapshot.
