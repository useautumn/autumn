# fast-customer-select — migration filter query optimization

Branch: `feat/fast-customer-select` (off dev). Laser focus: make the
`buildCustomerSelect` query family efficient at 4M+ customer scale so regular
migrations (and the dashboard) never block. Transplants cleanly into the
batch-migrations stack afterwards (files are byte-identical on both branches).

## Measured problem (bench org: 4M customers, dev Neon DB)

One query family (`buildCustomerSelect` / `buildCustomerCount` /
`buildProcessedPreviewSelect|Count`) serves four callers: migration claim loop,
dashboard filter preview page, dashboard count, execution view. All inherit the
same candidate-query shape, measured on bench-paid (600k matched of 4M):

| Scenario | Time |
|---|---|
| Fresh claim page (5k customers) | ~4.0s — flat per page, every page |
| Mid-run claim, stale mir stats (300k processed) | **>5min, cancelled** — planner still assumes mir ≈ 1 row, materialized nested-loop anti-join |
| Mid-run claim, fresh stats, no cursor | ~4.4s (Hash Anti Join, +0.4s only) |
| Mid-run claim, fresh stats, with cursor | ~3.2s (cursor pushes into scan) |

Root causes:

1. **Full-set materialization**: access-path source is a closed
   `SELECT DISTINCT` subquery (products CTE → cp join → customers join), so
   ORDER/LIMIT/cursor can never reach the scan. Every call seq-scans 4M
   customers, HashAggregates 600k rows (61MB disk spill), then top-N sorts for
   5000. Cost ∝ matched set, not page size.
2. **Plan filter evaluated twice**: the access path narrows the *source* but
   the fallback IR WHERE re-proves plan membership as a hash semi-join —
   second full cp scan + 600k-row hash per call.
3. **mir stats trap**: a new `migration_internal_id` isn't in the stats
   histogram (est ~1 row even on a freshly analyzed table), and a migration
   inserts 500k+ mir rows faster than autoanalyze reacts on a big shared
   table. The claim's anti-join keeps the materialize/nested-loop plan →
   unbounded blowup. This is prod's "1M+ migration dies at ~500k" (observed:
   `plan-update-all-2-ljq`, 586,891 run, 1 orphaned `running`, trigger task
   long dead).
4. **Execution view UNION**: with `migrationId` set, preview takes the UNION
   path — full filter-set materialization UNION 587k mir-driven semi-join,
   then dedupe. Pays cause 1 + a mir scan + a million-row UNION.
5. Dashboard count (`buildCustomerCount`) is an unbounded COUNT over the same
   materialization — no LIMIT possible, tens of seconds at prod scale.

## Architecture insight

The compiler split is sound: `filterToIr → irToSql` = semantic truth over
`customers c`; `chooseCustomerAccessPath` swaps in a narrowed source as an
optimization. Fixes are surgical — mostly `planPlanIdAccessPath` + the
composition layer (`buildCustomerSelect`), not a compiler rewrite.

Key files:
- `server/src/internal/migrations/v2/filters/customers/buildCustomerSelect.ts`
- `shared/api/migrations/filters/planner/buildCustomerCandidateQuery.ts`
- `shared/api/migrations/filters/planner/accessPaths/planPlanIdAccessPath.ts`
- `server/src/internal/migrations/v2/handlers/handlePreviewMigrationFilter.ts`
- bench tooling: `server/tests/perf/batch-migrations/` (probes + 4M seeded org)

## Units

### U0 — Baseline matrix + facts (bench only)
Shape-matrix probe runner: selective plan (600k), dominant plan (2.2M),
multi-plan IN, plan+custom=false residual, mid-run ±cursor, restart path,
full count, execution-view UNION. Record baseline ms per query. Also check
`SELECT version()`: PG17 keeps index order through `= ANY(...)` scans; below
17, U2's multi-plan ordered scan needs a MergeAppend workaround.

#### U0 results (2026-07-29, dev Neon, 4M bench org)

PG **18.4**, `work_mem=4MB`. PG ≥17 → index order survives `= ANY(...)` scans,
so U2's multi-plan MergeAppend workaround is NOT needed. The 4MB work_mem is
why every aggregate spills (61–258MB sets vs 4MB budget).

Timed (plain-run) baselines; explain-analyze wall is 2–6× higher from
instrumentation:

| Scenario | Timed | Notes |
|---|---|---|
| S1 claim selective (600k) | 4.0s | flat per page |
| S2 claim dominant (2.4M) | 10.2s | ∝ matched set; 480-page run ≈ 80min of claims |
| S3 claim multi-plan (1.6M) | 8.0s | fallback semi-join SEQ-SCANS cp (4M rows) |
| S4 claim +custom:false (2.2M) | 10.2s | residual adds ~nothing; set size rules |
| S5 claim deep cursor | 2.7s | cursor shrinks the set, never page-proportional |
| S6 claim mid-run +cursor (300k mir) | 3.1s | anti-join cheap w/ fresh stats |
| S7 claim restart, no cursor | 4.3s | +0.3s over S1 for 300k rejects |
| P1 dashboard page (51 rows!) | 10.0s | LIMIT never pushes down |
| C1 count selective | 3.7s | same shape as S1 minus sort |
| C2 count dominant | 9.5s | the "Search 0 customers" hang |
| E1 execution page (51 rows) | 5.1s | UNION: S1-cost + mir branch + 600k spill sort |
| E2 execution count | 5.7s | worst family member per useful byte |

Every scenario's plan contains all three sins: 4M customers seq scan, cp
scanned twice (S3: one of them a full 4M seq scan), spilled HashAggregate.
mir anti-join confirmed cheap with fresh stats (S6/S7). Raw plans:
`server/tests/perf/batch-migrations/results/*.json`.

### U1 — Consume the predicate the access path proved
Leaf-consumption contract in `buildCustomerCandidateQuery`: when the plan
access path is used, drop the `plan.plan_id` leaf from the fallback WHERE.
Kills the duplicate cp scan + semi-join.
Acceptance: EXPLAIN shows one cp scan; row-set parity on matrix; filter tests
green.

#### U1 results (implemented, matrix re-run)

All-or-nothing quantifier consumption shipped: provable set = plan_id eq/in,
version eq/in, addon/custom eq. Duplicate cp scan + semi-join gone from every
plan (S3's 4M cp seq scan eliminated; S4's custom pushed into source).
Planner tests updated (95 pass). Timed before → after:

S1 4.0→4.7s (first-run noise), S2 10.2→8.8s, S3 8.0→5.5s, S4 10.2→7.1s,
S5 2.7→1.0s, S6 3.1→2.6s, S7 4.3→3.6s, P1 10.0→7.0s, C1 3.7→3.2s,
C2 9.5→6.6s, E1 5.1→4.1s, E2 5.7→3.9s.

~15–30% off most shapes. Remaining flat cost = the materialization itself
(customers seq scan + DISTINCT spill) — U2's target.

### U2 — Streaming candidate source (centerpiece)
Ordered, keyset-aware source; thread `{order, limit, cursor}` hints from
`buildCustomerSelect` into the access path:

```sql
SELECT c.* FROM (
  SELECT DISTINCT ON (cp.internal_customer_id) cp.internal_customer_id
  FROM customer_products cp
  WHERE cp.internal_product_id IN (<plan product ids>)
    AND cp.status IN (...) AND cp.internal_customer_id < $cursor
  ORDER BY cp.internal_customer_id COLLATE "C" DESC
) m JOIN customers c ON c.internal_id = m.internal_customer_id
WHERE <residual IR where> AND <checkpoint anti-join>
ORDER BY c.internal_id DESC LIMIT 5000
```

Pipelined end to end: ordered index scan → streaming dedupe → per-row probes →
stops at LIMIT. New index (manual CONCURRENTLY apply):
`(internal_product_id, internal_customer_id COLLATE "C")` on customer_products.
Acceptance: page cost ∝ page size — target <500ms at any cursor depth on 4M;
no HashAggregate / top-N sort in EXPLAIN; row-set parity vs old query.

#### U2 results (implemented — cohesive composition)

Design pivoted from a gated "streaming fast path" to a first-class compiler
composition (John's call): `composeCustomerPage` in the shared planner builds
a page-bounded query for EVERY filter shape:

- driver = per-product ordered LATERAL index walks on
  `idx_customer_products_product_customer_c` (plan access path) or an ordered
  customers walk (fallback shapes);
- EVERY predicate — residual filter (joins customers inside the walk),
  checkpoint, cursor, dashboard search/list filters — evaluates INSIDE the
  walk, so LIMIT counts matches: a short page provably means exhausted and
  NO iteration contracts changed anywhere.
- `buildCustomerSelect` with a limit always delegates to the composer;
  without a limit the legacy query is byte-identical. Checkpoint predicate
  has one raw source of truth (`buildCheckpointPredicateSql`).

Membership parity proven at 4M scale (probeFilterParity, legacy vs paged,
EXCEPT ALL both directions): 12 shapes ALL OK — incl. custom:false = exactly
2.2M / custom:true = exactly 200k, checkpoint mid-run = exactly 300k, page
iteration 120×5000 full pages, short page = exhaustion. Perf: claim/preview
shapes at 8–100ms (was 4–10s); S7 restart ~715ms.

Trade-off documented: sparse residuals make one page query walk far
internally (bounded memory, ≤ legacy work; escape hatch = cost-based access
choice in the compiler if ever needed).

### U3 — Counts never touch customers
When all residual leaves are cp-level (plan + custom filters are),
`buildCustomerCount` → `COUNT(DISTINCT cp.internal_customer_id)` off the cp
index. Join customers only when customer-level leaves exist. Optional product
call (out of scope): cap dashboard counts via existing
`buildLimitedCustomerCount`.
Acceptance: dominant-plan count <1s on bench.

#### U3 results (implemented — compiler-owned aggregation access paths)

`composeCustomerCount` ALWAYS returns the query (no undefined/fallback gate):
fully plan-level filters → cp-only GROUP BY count (no customers join, no row
payloads); residual/search shapes → batch-hash count composed from the same
candidate source/where pieces (optimal for unbounded aggregation). Server
`buildCustomerCount` is a thin adapter; `buildLimitedCustomerCount` wraps the
bounded page query. Count parity 7/7 shapes exact; timings: selective
3.6s→0.5s, dominant 8.7s→2.8s, custom-false 14.6s→3.1s, checkpoint
3.7s→0.8s; residual counts ≈ legacy by design.

### U4 — Execution view drops the UNION
Processed branch drives from `migration_item_runs` (small, indexed side)
joined to customers; statuses read off mir directly.
Acceptance: execution page at 300k processed <1s on bench.

#### U4 results (implemented — preview union on shared composers)

`composeCustomerPage` refactored into reusable pieces (`composeCandidateIdPage`
bounded id-walk, `composeCustomerIdSet` unbounded id-set,
`wrapIdsWithCustomerColumns` payload join). New `composeCustomerPreview.ts`
reuses them verbatim and adds only the mir branch: preview page = bounded
filter walk ∪ bounded mir walk (C-collation index, cursor + predicates
inside) → dedupe → re-limit → payload join; preview count = distinct union
of the two id sets (customers table untouched). Server preview builders route
mode "all" (+limit) through the composers; explicit-status / not_run / mixed
modes unchanged (mir-rooted or rarer — follow-up: migrate them onto branch
selection + per-branch predicates).

Parity: overlap case (processed ⊆ filter, union exactly 600k — dedupe) and
disjoint case (processed outside filter, union exactly 1.3M) both exact,
EXCEPT ALL clean. Execution page 51 rows: ~4–5s → 10–18ms; count 3.7s →
1.2–1.8s. 110 unit tests green.

#### Final scoreboard (U0 baseline → post-U4, 4M bench org)

| Scenario | U0 | Final | × |
|---|---|---|---|
| S1 claim selective (600k) | 4.0s | 58ms | 70× |
| S2 claim dominant (2.4M) | 10.2s | 54ms | 190× |
| S3 claim multi-plan | 8.0s | 62ms | 130× |
| S4 claim +custom:false | 10.2s | 48ms | 210× |
| S5 deep cursor | 2.7s | 50ms | 55× |
| S6 mid-run resume (300k mir) | 3.1s | 70ms | 45× |
| S7 restart no cursor | 4.3s | 674ms | 6× (once/crash) |
| P1 dashboard page | 10.0s | 8ms | 1250× |
| C1 count selective | 3.7s | 571ms | 6.5× |
| C2 count dominant | 9.5s | 2.8s | 3.5× (floor-bound) |
| E1 execution page | 5.1s | 10ms | 500× |
| E2 execution count | 5.7s | 748ms | 7.6× |

### U5 — Stats guard for the claim
`ANALYZE migration_item_runs` (~100ms) at chunk boundaries in the run loop.
Acceptance: stale-stats probe scenario no longer reaches the catastrophic
plan.

### U6 — Regression sweep + ship
Full matrix before/after table; existing migrations-v2 integration suite;
commit per unit; PR to dev. Batch branch inherits via clean merge.

Order: U0 → U1 → U2 → U3/U4 (independent) → U5 → U6.
Riskiest decision: multi-plan ordered scan on PG <17 — settled by U0.

## Bench context notes

- Bench org `batch-bench` on dev Neon DB: 4M customers, shapes documented in
  `seedBatchBench.ts`. Mid-migration state seeded: `probe_mig_mid` = 300k
  succeeded mir rows over ids 3,500,001..3,800,000 (top half of bench-paid in
  claim order). Cleanup: `probeClaimMidMigration.ts --cleanup`.
- `benchRunMigration.ts` is parked in the session scratchpad (imports
  batch-lane code absent on dev); restore when back on `feat/batch-bench`.
- Stash `batch-bench: local test-file deletions` holds John's local deletions
  for `feat/batch-bench`.
