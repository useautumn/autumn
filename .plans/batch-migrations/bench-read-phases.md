# Batch migrations — read-phase benchmarks

Bench org `batch-bench` on the worktree Neon DB (PG 18.4, work_mem 4MB):
4M customers / ~4.2M customer_products / ~2.4M customer_entitlements /
400k subscriptions. Shape ranges documented in `seedBatchBench.ts`.
Prod reference scale: 24M cusProducts, 100M+ cusEnts, 500k subs — every
conclusion below is judged against "unbounded" tables.

Probes: `server/tests/perf/batch-migrations/probes/` —
`probePartitionCandidates.ts`, `probePhaseIndexAudit.ts`,
`probePageSize.ts`, `probe50kReadPipeline.ts`.

## Batch page pipeline status

| # | Step | Verdict |
|---|------|---------|
| 1 | claim SELECT | ✓ ~35–50ms @5k, ~180ms @50k warm; linear, flat at any cursor depth |
| 2 | claim UPSERT | ⏳ unmeasured (write) |
| 3 | partition | ✓ ~40–95ms @5k, 0.7–1.1s @50k; index-shaped at both sizes |
| 4 | candidate SELECT | ✓ ~100–150ms @5k warm, all rungs; ⚠ plan flip at 50k (below) |
| 5 | JS enrich | ✓ pure JS, ms |
| 6 | INSERT | ⏳ unmeasured (write) |
| 7 | marks | ⏳ unmeasured (write) |
| 8 | finalize | skeleton — future |

## Per-rung timings @5k page (run1 = cold cache, run2 = warm)

| Scenario | Partition | Candidates | Notes |
|---|---|---|---|
| paid-now | 829→95ms | 488→109ms | paid EXISTS fires |
| paid-sub | 132→64ms | 416→126ms | subAnchor resolved 5,000/5,000 (UNNEST lateral) |
| sibling | 103→42ms | 359→125ms | sibling anchor 5,000/5,000 |
| custom range | 104→43ms | 130→92ms | partition excluded customs (503/5,000 matched) |
| starts_at | 1048→71ms | 139→136ms | fallback anchors null as designed |
| cp-anchor | 62→65ms | 133→151ms | |
| boolean (no anchor sources) | 42→44ms | 112→103ms | cheapest |
| dedup no-op (already added) | 46→52ms | 96→98ms, 0 rows | replay idempotency ≈ free |

## Index audit @5k (EXPLAIN, every scan node)

All unbounded-table access is per-row index probes:
customers→customers_pkey; customer_entitlements→idx_ce_customer_product_id_c;
customer_prices→idx_cpr_customer_product_id_c;
subscriptions→subscriptions_stripe_id_key; prices/entitlements→pkeys;
customer_products→bitmap over the id list. The only "Seq Scan" flags are a
never-executed alternative subplan (0 loops) on `entitlements` — a small
catalog table. Cost model: 5,000 × O(log n) probes, independent of table size.

## Claim select page-size scaling (warm / cold)

| limit | bench-paid | bench-free |
|---|---|---|
| 5k | 35ms / 115ms | 32ms / 33ms |
| 25k | 101ms / 759ms | 96ms / 844ms |
| 50k | 180ms / 1064ms | 177ms / 1230ms |

Perfectly linear (~0.004ms/row warm). Reads do not constrain page size.

## ⚠ 50k pipeline — the plan-flip finding

End-to-end @50k: claim 186–227ms; partition 0.7–1.1s (still bitmap);
candidates 1.9s (paid, still bitmap) BUT **3.3s on bench-free with a
parallel `Seq Scan on customer_products`** — at 50k ids the planner flips
from bitmap-index probing to hash-the-ids + scan-the-table. Fine at 4M rows,
O(table) at prod's 24M+. The flip boundary is somewhere in 5k..50k and is
table-size dependent — NOT safe to rely on.

**Conclusion: keep PAGE_SIZE at 5k.** It stays comfortably inside the
index-shaped regime on every query, bounds the txn/crash blast radius, and
the per-page read overhead (~250–350ms total) is already small relative to
expected write costs. Revisit only with prod-scale EXPLAINs in hand.

## Hot-path collision probe (probeHotPathConcurrency)

3 full-tilt getFullSubject readers + 2 syncItemV4-style balance writers on
the SAME customers a live 10-page migration inserts rows for (bench-free):

| | reads p50/p95/p99/max | sync writes p50/p95/p99/max |
|---|---|---|
| idle | 17 / 22 / 26 / 244ms | 8 / 10 / 12 / 54ms |
| during migration | 18 / 26 / 54 / 356ms | 8 / 13 / 21 / 172ms |

p50 unchanged; tail +~30ms at p99. Zero errors. MVCC analysis confirmed:
migration inserts don't block hot-path reads or balance flushes. Reads on
dormant seeded customers trigger real lazy resets (writes) — included.

Bench artifact discovered: repeated revert cycles (mass DELETE of mir rows +
added cusEnts) leave dead tuples that degrade claim_select (146ms → 3.2s/page
until autovacuum). Prod is insert-only on mir — different profile. Bench
mitigation: occasional VACUUM migration_item_runs / customer_entitlements
after reverts.

## Write-phase results (B1 instrumentation, bench-paid words ×3 pages)

Phase timings now live in the execution path (`BatchMigrationPagePhases` on
the chunk summary + per-page logger line "batch-migration: page executed").

| Phase | p1 | p2 | p3 (warming) |
|---|---|---|---|
| **insert** | **4723ms** | **2650ms** | **1771ms** |
| partition | 555 | 115 | 125 |
| claim_upsert | 378 | 243 | 267 |
| claim_select | 192 | 279 | 208 |
| candidates | 212 | 200 | 188 |
| marks | 102 | 107 | 105 |
| enrich | 8 | 9 | 7 |
| page total | 6231 | 3662 | 2743 |

**INSERT is 65–75% of page cost** (~0.35ms/row warm — JSONB_TO_RECORDSET +
scope re-join + ON CONFLICT + cusEnt index maintenance ×~17 indexes).
Everything else matches the read probes. Projection: 600k ≈ 120 pages ×
~2.7s ≈ 5–6 min end-to-end at current shape. Next dig: EXPLAIN the insert —
how much is index maintenance (irreducible) vs re-join/conflict probing.
