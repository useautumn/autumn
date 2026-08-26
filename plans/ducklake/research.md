# ducklake — in-region lake aggregation job

Replace the MotherDuck flights + the server cron's MotherDuck rebuild with one
Flightcontrol Job Scheduler service (`packages/ducklake`) running embedded
DuckDB in us-east-2, next to the lake bucket. MotherDuck becomes a serving
layer: it ingests small prepared parquet instead of scanning the lake itself.

## Why

Measured 2026-08-24 (all three refresh pipelines at old cadences):

| Cost line | Before | After cadence fixes | After ducklake |
|---|---|---|---|
| MD Standard duckling compute | ~$1,180/mo | ~$360–460/mo | ~$10–30/mo (Pulse) |
| MD flight-hours fee | ~$245/mo | ~$45/mo | $0 (flights deleted) |
| AWS cross-region S3 (`USE2-USE1-AWS-Out-Bytes`, bucket owner pays) | ~$930/mo | ~$310–400/mo | ~$70–110/mo |
| MD storage | ~$3/mo (post retention-0) | same | same |

MD compute bills wall-clock per duckling touch (startup + work + cooldown +
1-min minimum), so shrinking the *work* only pays once ingest moves to a Pulse
duckling (per-query CU metering, no cooldown floor). Cross-region S3 is billed
to OUR AWS account (credits) at $0.01/GB — invisible on the MD invoice.

## Decisions (locked 2026-08-24)

1. Manifest discovery: **Glue pointer** (`getCurrentLakeMetadataLocation`
   pattern — validated regex), not the flights' S3 glob-max.
2. Package: **`packages/ducklake`**.
3. **One FC service**, 20-min schedule, internal gating: cold mirrors +
   headline rollup only every 3rd run (hourly).
4. Scratch: `s3://autumn-lake-prod-us-east-2/internal/lake-cache-scratch/` —
   INSIDE `internal/` so MotherDuck's `lake_s3` secret (scoped internal/*) can
   read_parquet it. Lifecycle rule `expire-lake-cache-scratch` (1 day) applied
   2026-08-24 alongside the pre-existing `abort-incomplete-mpu` rule (PUT
   replaces the whole config; both rules verified present).
5. **Auto-deploy**: register in infra `PRODUCTION_CONFIG.internal.services` so
   `/api/deploy/github` bumps it every main merge. NOT in blue-green lists,
   NOT in staging (exclusion is passive).
6. AWS identity: the Infisical-injected IAM **user `john`** (overrides task
   roles in every container). Audit 2026-08-24: `AmazonS3FullAccess` +
   inline `glue-read-internal-lake` already cover lake read, scratch write,
   Glue GetTable — **zero IAM changes needed**. john cannot self-modify IAM;
   future additions need an admin identity. Additive-only if ever extended.
7. Monitoring: Axiom monitor on job failure / refresh_status staleness; job
   logs via `@autumn/logging` + firelens (`source_type: ducklake`).
8. Interim cadences (DONE 2026-08-24): server cron `*/5`→`*/20` (PR #3034);
   flight lake-cache-refresh → `0 * * * *`; lake-cache-refresh-cold →
   `30 * * * *`; fx-rates-refresh → `30 15 * * 1` (weekly).
9. Pulse: flip the RW/ingest identity's duckling to Pulse AT CUTOVER (after
   flights are deleted), not before.
10. fx-rates: stays a MotherDuck flight (weekly). Contract: `fx_rates(currency
    VARCHAR, per_usd DOUBLE, rate_date VARCHAR, fetched_at TIMESTAMP)` must
    exist when the job builds `headline_totals`.
11. This doc is the research artifact.
12. Workspace hygiene is a hard requirement: root `package.json` workspaces
    entry, `docker/Dockerfile` deps-stage `COPY packages/ducklake/package.json`
    line (the frozen-lockfile install enumerates EVERY workspace manifest),
    regenerated `bun.lock`, Dockerfile header comment.

## Contracts the job must preserve (extracted from live flights/dives)

- Write into the SAME MotherDuck database `lake_cache` — it is share-linked
  twice (dives consume share `fc8b8511…`; ayush attaches `85552d92…`). A new
  DB orphans both.
- Swap pattern per table: build `<table>__new`, then DROP (tolerating VIEW —
  `drop_existing` checks information_schema) + `ALTER TABLE RENAME`. Never
  drop-then-create; live dive sessions must never see a missing table.
- Type fingerprint from iceberg_scan: numerics `DECIMAL(38,10)`, timestamps
  epoch-MILLISECOND decimals, arrays `VARCHAR[]`. Dives do
  `created_at >= extract(epoch …)*1000` and `UNNEST(internal_product_ids)`.
  Parquet written by the job must reproduce these exactly.
- `refresh_status` / `refresh_status_cold`: full-replace tables
  `(tbl, snapshot, row_count, refreshed_at)`; Leaderboard freshness widget
  reads `max(refreshed_at)` from `refresh_status`. Widen row_count to BIGINT
  (INTEGER today; customer_entitlements is at 114M).
- `headline_totals` rollup SQL inherited verbatim (live/paid/hosted-url LIKE
  '%live%' filters, slug exclusion `welcome-back-1747670264`,
  `total / coalesce(fx.per_usd, 1)`). Needs fx_rates at build time.
- Hot tables (dive consumers): invoices, customers, organizations, products,
  customer_products (+ headline_totals, refresh_status). Cold tables (NO dive
  consumers today): prices, features, entitlements, invoice_line_items,
  customer_prices, customer_entitlements (+ refresh_status_cold).
- Our fetchset tables fold in: ce_balances projection (or skip materializing),
  ce_balance_totals, ent_allowances, cp_active — semantics per
  `refreshCeBalancesCache.ts` (finite-only remaining/granted, all-rows
  usage_total incl. entities_balance, finite_rows).

## Byte path

Job (us-east-2 Fargate): Glue pointer → iceberg_scan (same-region, free) →
aggregate/copy → parquet to scratch prefix. Then ONE `ATTACH 'md:lake_cache'`
connection issues per-table `CREATE TABLE x__new AS FROM read_parquet('s3://…')`
+ swap — MotherDuck pulls parquet from S3 itself ($0.01/GB, bucket owner) —
never push bytes through the job's connection (Fargate egress $0.09/GB).

## Deploy topology (from infra repo mapping)

- FC services are DASHBOARD-configured (no IaC). Create Job Scheduler service
  in prod env `cmhnn4vtj00jx16hgcw1jzvnh`: image ECR `autumn` (us-east-2),
  command `bun <ducklake entrypoint>`, 20-min schedule, four `INFISICAL_*`
  bootstrap env secrets copied from cron's config, firelens custom config.
- Entrypoint boots `await initInfisical()` like every service; MD tokens and
  AWS keys arrive from Infisical prod.
- Register `{name, serviceId, flightcontrolGivenId}` in infra
  `production-config.ts` `internal.services` (auto-deploy). Leaf commit
  `4fec1c2` is the blue-only precedent.
- `firelens.conf`: add ducklake `source_type` block (unit test
  `server/tests/unit/logging/firelens-config.test.ts` asserts the file).
- First FC service of type Job Scheduler in this org; fallback if it
  disappoints is trigger.dev — REJECTED for primary because its cloud runs
  us-east-1/us-west-2/eu-central-1 only (no us-east-2 → egress returns).

## Cutover (zero server downtime, zero DDL)

1. Ship ducklake writing to scratch + ingesting ONLY the fetchset tables
   (ce_balance_totals & co); retire the server cron's MD step.
2. Add hot mirrors + headline_totals + refresh_status to the job; pause flight
   `lake-cache-refresh`; watch the dives' freshness widget.
3. Add cold mirrors + refresh_status_cold; pause `lake-cache-refresh-cold`.
4. Delete both refresh flights; flip ingest identity to Pulse.
5. Rollback at any step = unpause the corresponding flight.
Gaps between steps cost staleness only; reads never break (same names, types,
swap semantics).

## Status

- [x] Cadence interim: cron PR #3034 (open), flights hourly/weekly (live)
- [x] packages/ducklake scaffold (workspace + Dockerfile + lockfile hygiene) —
      draft PR #3038
- [x] Fetchset-tables phase BUILT in shadow mode — draft PR #3039 (stack
      #3040); scratch lifecycle rule applied. NEXT: manual shadow run
      (`cd server && infisical run --env=prod --recursive -- bun src/ducklake.ts`,
      DUCKLAKE_SHADOW defaults on) → diff `ce_balance_totals__ducklake` vs
      incumbent → flip DUCKLAKE_SHADOW=0 at cutover
- [x] Hot-mirror phase BUILT in shadow mode — draft PR #3041: generic mirror
      module (phase 3 = +6 table names), single MD session per run,
      headline_totals rollup executed on MD (fx_rates lives only there),
      refresh_status w/ BIGINT row_count, wall-clock hourly gate
      (`DUCKLAKE_FORCE_HOURLY=1` to force in manual runs). Cutover: shadow
      diff → DUCKLAKE_SHADOW=0 → unschedule flight lake-cache-refresh.
- [x] Cold-mirror phase BUILT in shadow mode — draft PR #3042 (per-table
      skip-on-failure; zero-tables-refreshed still throws). FC task size:
      4 vCPU / 16 GB.
- [ ] Flight deletion + Pulse flip (endgame, after quiet cutover)
- [x] Axiom monitor + runbook — draft infra PR useautumn/infra#11
      (ducklake-staleness, Major, 90-min absence of `ducklake_phase`; deploy
      via `bun monitors:deploy` AFTER the FC service is live)
- [ ] Infra registry entry — BLOCKED on FC service creation (needs the
      FC-generated serviceId); same PR should special-case the dashboard UI
      card (scheduler has no standing ECS service → renders NOT_FOUND today)
