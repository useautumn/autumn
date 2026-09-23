---
author: john + claude
feature: balance-worker-pool-writes
date: 2026-09-23
status: research — decisions open
---

# Pools, contributions and licenses on the worker: research

Goal: decide, piece by piece, which rows and writes move into the balance worker and which stay
in Postgres, for pooled balances (customer-level and license-scoped), contributions, license pools
(`customer_licenses`) and seat products. Builds on `plans/balance-worker-pooled-balances/` (the
worker reads pools, unit 1 done) and `plans/balance-worker-apply-plan/overview.md` (facet map).

## The objects

```
customer cus_1
├─ pooled_balances pb_1        granted 100k · reset_mode · stripe_subscription_id
│    │                         customer_license_link_id (null = customer-level)
│    ├─ POOL_CE (synthetic)    balance 100k   ← the one live balance; tracks draw here
│    │    └─ rollovers
│    ├─ synthetic entitlement  catalog row (is_custom, allowance 0)
│    └─ pooled_balance_contributions ×N   one per SOURCE_CE
│         current · next_cycle · effective_at (staggered per entity)
│
├─ SOURCE_CE ×N (product cusEnts, on entities or customer)
│    balance 0 · pooled_contribution_id set   ← never moves
│
├─ customer_licenses cl_1      granted = included + paid_quantity · remaining · link_id
│    └─ plan_license (catalog; worker catalog since L1)
│
└─ entity ent_1 ─ SEAT cusProduct (customer_license_link_id = link_1)
                   status / subscription_ids / canceled_at inherited from the parent AT READ TIME
                   (getFullCusQuery LATERAL + inheritParentCustomerProductProperties); a cron
                   (seatSyncCron) repairs the stored copies later
```

- Non-license pool: `granted = Σ current_contribution`, kept by deltas; recomputed from Σ only in promote.
- License pool: `granted = customer_licenses.granted × per-seat grant`; contributions exist but add 0;
  never expired on write, hidden at read when the parent is dead (`licensePooledBalanceIsLiveSql`).

## What the worker holds today

| row | in state | written by the worker |
|---|---|---|
| POOL_CE + rollovers | yes (customer part only) | track increments, reset set |
| `pooled_balances` | yes: id, cusEnt id, granted, unlimited, reset_mode | reset `set granted` (from promote) |
| contributions | no | promote runs **SQL outside the log** (`promoteDuePooledContributions`, no `updated_at` guard) |
| SOURCE_CE | dropped at hydration; a routed plan inserts them anyway | — |
| license pools / seats | no (`subjectRowsSql.ts:59,113`) | — |
| `customer_licenses` | yes (L1, read-only) | — |

## Every writer (outside tracks)

| writer | what | shape |
|---|---|---|
| `executePooledBalancePlan` (plan, 2nd txn on the worker path) | insert graph; `granted += Δ`, POOL_CE `balance += Δ`; lifecycle cols SET; contributions upsert + **SOURCE_CE SET balance 0**; contribution SET/delete; expire-if-no-contributions; delete graph (rollback) | mixed |
| `applyPooledBalanceCustomerProductTransitions` | same plan, not via the executor: sub webhooks, entity defaults, trial revert, license reconcile | mixed |
| `promoteDuePooledContributions` (server) | `granted = Σ(due ? next : current)`, CAS on `updated_at` | set |
| resets (lazy, V1 cron, batch, `invoice.created`) | POOL_CE `balance = granted` CAS `next_reset_at` + rollover insert; cron promotes too | set |
| `batchTransition` (seats, async over 1k entities) | contributions, license pool graph find-or-create, seat cusEnts; O(seats), ≤100k/op | chunked |
| `customerLicenseRepo` | take `remaining -= n WHERE remaining >= n`; release `LEAST(remaining+n, granted)` by link (hits predecessor rows too); paid `+= Δ`; repoint SET | guarded/incr/set |
| reconcile | blind SET `granted`/`remaining` from counts, no lock; expires surplus unused seats | set |
| `seatSyncCron` | copies parent status/sub ids onto seats | set |

## Where the worker goes stale today

1. A routed pooled plan: pool graph, `granted`, zeroed sources, expiry all land only in Postgres; a
   product cusEnt that becomes a SOURCE keeps its balance in worker state (double count).
2. Reset cron resets the pool in Postgres without evicting the worker; the worker resets it again.
3. `invoice.created` and the worker both reset subscription pools, no guard on either side.
4. The worker's promote writes contributions before its record reaches Kafka.

## Hot path

Track/check read only POOL_CE + `granted`. Contributions are read only by billing compute
(`CusService.getFull`), the promote step at reset, and `/pooled_balances.list_contributions`.
Seats: an entity track reads that entity's seat rows plus the parent for inheritance.

## Decisions to make

| # | question | options |
|---|---|---|
| D1 | contributions | (a) rows in the worker, customer state · (b) rows in the worker, the SOURCE_CE owner's state + aggregates on the pool row · (c) rows stay Postgres, the worker holds aggregates (count, pending promotions) |
| D2 | SOURCE_CE | worker rows (hydrated, zeroed by an update op in the same mutation) · keep dropping them |
| D3 | pool expiry | in-memory (needs D1 a/b) · `contribution_count` on the pool row · PG conditional after |
| D4 | promotion at reset | pure in-memory decision (needs contribution data) · keep the out-of-log SQL |
| D5 | Postgres-side pool resets (cron, `invoice.created`) | retire for routed customers (worker owns resets) · keep + evict |
| D6 | seat inheritance | in-memory join at read (parent is in the customer part) · keep stored copies + cron |
| D7 | seat counters | worker ops: take (floor 0, refuse plan), release (ceiling granted), set paid qty; reconcile becomes a worker plan |
| D8 | batchTransition fan-out | stays Postgres/async for now · N chunked worker plans later |
| D9 | `applyPooledBalanceCustomerProductTransitions` | goes through the executor (→ worker) · stays direct |

## Prod sizes (replica, 2026-09-23)

| what | value |
|---|---|
| pools | 52,457 non-license (42,171 live, 36,973 customers) · 12 license (10 customers) |
| contributions per pool | p50 1 · p99 2 · max 63 |
| contributions per customer | p99 2 · max 63 |
| pending (deferred) contributions | 0 |
| `customer_licenses` pools | 12,373 (11,755 customers) |
| seat products | 4,113 total · max 41 per link |

Contributions are tiny: holding them as worker rows costs at most 63 rows for the largest customer.

## Pooled balances: decided (2026-09-23)

Supersedes the D1–D9 recommendations above (D1a rejected: 1M entities).

| piece | decision |
|---|---|
| in memory | customer part only: `pooled_balances` (granted, `pending_at_next_reset`, `last_applied_reset_at`) + POOL_CE + pool rollovers. **Contribution rows are never in memory**; no hot path reads them (only `list_contributions` and billing compute, both from Postgres) |
| plan ops | a contribution op carries the row as the server read it (current, next, effective_at); the engine derives the share with `effective_at ≤ pool.last_applied_reset_at ? next : current` and moves the pool total in the same mutation; the committer writes the row |
| load | nothing pooled beyond the rows: the pending sum is read at reset time (above); new partial index `(pooled_balance_id) WHERE effective_at IS NOT NULL`, created concurrently, no backfill |
| reset | **revised (unit 4, design B):** before deciding, the sender sums each due pool's shares in Postgres (`SUM(due ? next : current)` over every share, the old promote formula) and stamps `pooledGranted` on the command; the decision sets `granted` to it, stamps `last_applied_reset_at`, and the record carries one "promote pb_1 shares due ≤ t" change; the committer runs one set-based UPDATE (uncapped for now). Nothing pending is kept in memory, so plans never move a pending number and compute stays untouched |
| expiry | a plan removing a share asks Postgres `EXISTS (another share of the pool)` in ensure; exact because **applyBillingPlan commands are serialized per customer** (the `customerCreates` queue widened to every plan) and each plan replies once stored. Never per partition. License pools and pools the same plan creates never expire |
| drift | none possible past a reset: the reset re-sums every share. 100k shares: SUM 64 ms, promote 121 ms (10k due) / 1.48 s (100k due) |
| still direct to Postgres (to route later, D9) | `batchTransition`, `applyPooledBalanceCustomerProductTransitions` |

**Per-customer plan throughput (Axiom `express`, prod, 7d, API + webhooks):** 10 s windows p99 5,
max 55, >10 in 0.08% of windows; 1 s windows p99 3, max 34. Bursts are client retry storms on
`billing.update` / `billing.attach` (mostly non-2xx), already serialized by the server billing lock;
webhooks contribute ~20 events/day to bursty windows. A one-plan-at-a-time queue per customer adds
no waiting at p99 and ~2–3 s backlog in the worst second, ~5×/day.


## Unbounded audit (scale bar: 1M entities per customer)

Per-entity balance maps (`entities` jsonb on customer-level cusEnts and rollovers) are the largest
item on both sides; **parked** by decision (2026-09-23). The rest, relevant to this work:

| where | grows with | note |
|---|---|---|
| contributions in customer state (rejected D1a) | entities | contributions go to the source's owner part |
| `promoteDuePooledContributions` (worker + server) | contributions | one UPDATE over every contribution, awaited before a track |
| worker-routed plans (`billingPlanToWorkerEntityIds`, `autumnBillingPlanToPlanOps`) | named entities | one command, no cap; `entities.create` batches have no max; O(N²) in `planSubjects` / merge / split |
| customer hydration `cus_products`, `cus_usage_windows`, `loose_entitlements`; entity `entity_record` | entity rows | index gaps: `internal_entity_id IS NULL` is a heap filter |
| `maxPendingCommandsPerCustomer: 1000`; `waitForPendingCommits({ customerKey })` | entities | all entities share one customer's slots |
| open locks in customer hydration | entities × lock rate | entity locks load on the customer |
| `expireUnusedAssignments`, `attachLicense` setup, assignments list | seats | no LIMIT |
| `batchTransition` | seats | hard-fails above 100k |
| `getFull` caps (300 entities, 15 products) | — | silent truncation: wrong results, not failures |
