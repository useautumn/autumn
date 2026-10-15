# Batch migrations through the balance worker

2026-10-12 · `og/batch-migrations-worker` · `6daf213850`

The batch lane writes `customer_entitlements` and `customer_products` straight to Postgres, then evicts
the worker's copy up to 3 pages later. For a routed customer that makes it a second writer. Until the evict
lands, the worker decides on the old rows, an evict that fails to queue leaves them stale until the next one,
and the change never reaches the log.

Selection stays in SQL. For a routed customer, what SQL selected becomes plan ops sent to the owner, and
what SQL read becomes a precondition the owner checks against the rows it actually holds. Customers who aren't
routed keep today's path, which goes away at 100% rollout.

## Context

### a batch page today
[migrations/v2/batchOperations/execute/executeBatchMigrationPage.ts · batchOperations/actions/ ·
tests/integration/billing/migrations-v2/batch-migrations/]

- customer on free (100 messages/mo, 60 used) · migration replaces 100 → 200
  - which statement changes the row, and what's the balance after?            → applyReplacePatches
  - the run is replayed: why isn't the 100 credited twice?                     → replace candidate excludes target
- page of 5,000 dies after its second candidate batch commits
  - which customers have rows changed, and what are their item runs?          → iterateCustomerProductPages · markPageItemRuns
- add metered 100/mo to a paid pro attached mid-cycle
  - where does the new row's reset anchor come from?                          → cycleAnchorSql
- remove messages where the row holds a 25 rollover
  - who refuses it, and where is that re-checked at write time?                → rowIsRemovableSql · deleteCustomerEntitlementRows

related: compute proves the patch is the same for every matched customer; execute is the only stage this plan changes.

### how the worker hears about it today
[finalize/invalidateBatchMigrationCaches.ts · fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.ts ·
balances/balanceWorker/queueBalanceWorkerEvicts.ts · tests/unit/redis/batch-invalidate-full-subjects.test.ts]

- page commits at 12:00:00 · the owner holds customer A
  - when does the worker stop using A's old rows? what if the evict append fails?     → deferred side effects
- A tracks 5 messages between the page commit and the evict
  - which row does the increment land on, for a remove and for a replace?             → runFlush increments by id
- the evict arrives while A's load is in flight
  - what stops the load keeping old rows?                                            → hydrateSubject waitForEvicted

related: billing plans for routed customers stopped evicting when they moved onto applyBillingPlan; this is the same move.

### applyBillingPlan, server to Postgres
[balanceWorker/billingPlan/applyBillingPlanOnWorker.ts · apps/balance-worker/src/processor/commands/applyBillingPlan/ ·
apps/balance-worker/src/committer/actions/runFlush.ts]

- server sends a plan deleting A's messages row
  - which records land on the log, and when does the reply come back?        → decidePlan durability · replyOnceStored
- the reply times out after the worker wrote it
  - what does a resend under the same id do? under a new id?                  → recentCommands · DUPLICATE_COMMAND
- the plan deletes a row the worker doesn't hold
  - what does the server get back, and what did the worker write?             → deleteOpToRowChanges
- the deleted row has a rollover and a replaceable
  - what's left in the worker's memory after Postgres cascades?               → cascadeOf · FK cascades

related: a track and a plan are both one mutation on the customer's partition; ordering comes from the partition, not locks.

### hydration and the subject map
[apps/balance-worker/src/processor/subject/actions/ensureSubject/ · processor/subject/createSubjectMap.ts]

- a 5,000-customer page where the worker holds 200 of them
  - how many Postgres reads, and who gets pushed out of memory?               → readSubjectBaseline · createSubjectMapBudget
- a customer with writes not yet in Postgres gets loaded
  - what does the load wait for?                                              → allStored · isEvicting

related: HTTP commands load under an answer deadline (SubjectLoadBusyError); queued ones don't.

### which customers are routed
[misc/rollouts/isBalanceWorkerRolloutEnabled.ts · resetCustomerEntitlements/batchResetCustomerEntitlements.ts:39 ·
plans/balance-worker-rollout/overview.md]

- org at 50%, customer A routed, B not, same page
  - which path does each take, and what keys the decision?                    → bucket of the public customer id
- the org moves 50% → 100% mid-page
  - who owns B's rows for the rest of the page?                              → effectiveAt · forward handoff
- a customer with no public id
  - can it be routed at all?

related: batch resets already split per customer this way.

## Plan

```
Batch migrations through the worker
- balance engine
  - 1 preconditions on plan ops
- migrations: batch lane
  - 2 remove items          (first slice: routing split, sender, marks)
  - 3 replace items
  - 4 add items
  - 5 version repoint and is_custom
- rollout
  - 6 throttle, observability, staging perf run
  - 7 cold apply            (only if 6 shows the subject map churning)
```

**Not doing**
- license ops: `customer_licenses` and seat rows stay SQL plus evict (the committer can't write them, seats aren't worker state)
- the worker resolving the patch from its own state: selection and the anchor ladder stay in SQL
- compute, guards, rejections, the batch vs per-customer lane decision
- the per-customer lane's Postgres fallbacks (license seats, entity claims): apply-plan work
- Redis invalidation for customers who aren't routed
- a per-partition batch endpoint, unless task 6 shows per-customer sends can't keep up

**Decided**
- transport: today's `applyBillingPlan` endpoint, one command per customer per phase (remove, replace, add, repoint), phases
  in the SQL path's order so each select sees the previous phase stored; bounded concurrency per page
- command ids: a fresh id per send. The worker keeps a refused id spent, so a deterministic id resent after a crash would
  come back DUPLICATE_COMMAND and read as applied. The guards make a fresh-id resend safe
- still stale after one re-select, or the re-select finds a row the worker can't hold: that customer's phase runs on the
  SQL path, whose writes re-check scope themselves, and the customer gets an evict. The worker answered, so the evict lands.
  This also covers products past the worker's 200-per-customer load cap
- SQL writes re-check what they read, since the worker may change a row between the read and the write: the replace
  and remove write only a row still on the entitlement read (else a stale balance delta lands twice), and the add insert
  repeats its dedup. This also hardens the path non-routed customers take today
- a worker restored from an old snapshot may lack `is_custom` and refuse once; if the reload serves the same snapshot,
  that customer takes the SQL fallback. Correct, only slower
- worker unreachable or unconfirmed: the item run fails and `retryItemStatuses` replays it; no SQL fallback, since an evict
  couldn't land either. 25 in a row abort the run as `interrupted`, like any page failure (no is_custom pass, no item events)
- a failed customer's `is_custom` isn't re-derived: a partial migration would read as custom, and a `custom: false` retry
  would then never select it. The retry finishes the migration and derives it
- rows the worker may not hold stay SQL in every phase: an entity with no external id has no subject, and the worker only
  loads active, past-due and scheduled products (migrations also touch paused). That customer then gets an evict
- every op names the product as SQL read it (`expectProduct`: version, status, `is_custom`, exact customer price ids), so
  the worker refuses a change once the product left scope, was customized or became paid. A worker that lost `is_custom`
  from its snapshot refuses once, drops its copy, and the re-select reloads it
- deploy order: workers ship the engine changes before any server sends `expect`, `expectProduct` or `expectFeatureGrants`.
  The schema is loose, so an older worker would ignore them and apply unchecked

### 1 · [x] preconditions on plan ops

**goal** — an op names what it expects the held row to be; a mismatch refuses the whole plan as stale and writes nothing
**steps** — `expect` on grant and product updates and every delete · `withoutRollovers` on a grant delete
**verify** — `cd packages/balance-engine && bun test --config ./bunfig.toml tests/unit/commands/applyBillingPlan/planOpPreconditions.test.ts && bun run ts`

**shape**
```
update grant | product, delete   + expect?: Record<column, primitive>
delete grant                     + withoutRollovers?: true
miss → StaleMutationError → 409 STALE_SUBJECT, and the worker drops its copy
```

**scenarios** — applyBillingPlan delete messages grant, `expect: { entitlement_id: ent_100 }`
- worker holds it on ent_100
- worker holds it on ent_200
- worker holds it with a 25 rollover, `withoutRollovers`
- worker doesn't hold it

**scenarios** — applyBillingPlan update, `expect` on the held row
- grant moved from ent_50 · repoint to ent_200
- product moved from v0 · repoint to v2
- product still on v1 · repoint to v2

### 2 · [x] remove items

**goal** — routed customers' remove candidates become guarded delete ops on their owner; the rest stay SQL
**steps** — split page customers by routing · select candidates for routed ids with today's query · one plan per customer
across the patch's removes · a fresh command id per send · stale → re-select once · failed customers
get no later ops this page and an item run of `failed` · grants of an entity with no external id stay SQL (no worker holds them)
**verify** — `cd server && UNIT_TESTS=1 bun test tests/unit/migrations-v2/batch-operations tests/unit/balanceWorker` ·
`bun t batch-migrations/remove-items`

**shape**
```
executeBatchMigrationPage
+ splitPageByRouting({ ctx, customers })                      → { worker, sql }
  removeCustomerEntitlementsForPage({ ids: sql })               unchanged
+ removeCustomerEntitlementsThroughWorker({ ctx, migrationRunId, patch, customers: worker })
+   removeCustomerGrantsOnWorker → applyMigrationPlanOnWorker({ ctx, customerId, plan, commandId })   → applied | stale
```

Removed and replaced items report the remaining balance SQL read, not the worker's.

**scenarios** — migrations.run remove messages from free (dashboard + 100 messages/mo, 40 used)
- routed, the worker holds the customer
- routed, the worker doesn't hold the customer
- not routed
- page with 2 routed and 2 not routed
- routed, the row holds a 25 rollover
- routed, an attach moved the row between select and send
- routed, the owner is unreachable
- routed, replayed after the first run's writes landed
- routed, a track for messages arrives while the command is in flight
- routed, the plan is on 2 entities
- routed, scheduled and past-due rows next to an expired one
- routed · `check` messages straight after the run

### 3 · [x] replace items

**goal** — replace candidates become an update (entitlement, feature, anchor, next reset, unlimited) plus an increment by Δ
**steps** — select + anchor ladder + patch grouping as today, minus the write · update op with `expect: { entitlement_id: from }`,
a `set` balance in the update, an `increment` balance as its own op · the target entitlement's catalog rows
**verify** — `bun t batch-migrations/replace-items` · `cd server && UNIT_TESTS=1 bun test tests/unit/migrations-v2/batch-operations`

**scenarios** — migrations.run replace messages 100 → 200, routed
- 60 used, a track in flight
- 80 used, replaced with 50
- fixed → unlimited · unlimited → 50
- customers on 10/mo and 5/mo both move to 30
- already on the target entitlement (replay)
- already at 200 under a different entitlement
- monthly → quarterly
- lifetime → monthly: sibling anchor, product start, paid billing anchor
- monthly → lifetime
- the row holds a 25 rollover
- `included: 100` filter next to a custom 1k row

### 4 · [x] add items

**goal** — add candidates become grant inserts the worker refuses if the product's grants for that feature changed
**steps** — `expectFeatureGrants` on a grant insert · the add select also returns the product's grant ids for the feature,
in the same statement as its dedup · insert row built as the SQL insert builds it · catalog rows for the new entitlement
**verify** — `bun t batch-migrations/add-items` · `cd packages/balance-engine && bun test --config ./bunfig.toml tests/unit/commands/applyBillingPlan`

**shape**
```
insert grant   + expectFeatureGrants?: Record<grantId, entitlementId>   held grants for its product and feature, exactly
every op        + expectProduct?: { columns, customerPriceIds }            the product as SQL read it
```

Decided over `absentSibling`: the worker doesn't hold intervals, so SQL decides "no same-interval sibling" and the worker
checks nothing changed since. A second add of the same feature in one plan expects the first.

**scenarios** — migrations.run add metered messages 100/mo, routed
- paid pro attached mid-cycle (+10 days)
- free plan
- same-interval sibling on the product
- 7-day trial
- scheduled row from a premium → pro downgrade
- replayed after the first add landed
- customized plan already at 100
- lifetime 50 already there
- boolean and static grants together

### 5 · [x] version repoint and is_custom

**goal** — `internal_product_id` repoint becomes a customer product update, and routed customers stop getting an evict
**steps** — repoint op with `expect: { internal_product_id: from }` and the target version's catalog rows · the page reports
`workerCurrentInternalIds` (routed, no SQL write this page) · finalize skips the evict for them · `is_custom` flips evict
**verify** — `bun t batch-migrations/version-repoint` · `bun t migrations-v2/is-custom`

Decided: `is_custom` stays SQL. Its flip is a compare-and-set on a fingerprint of the product's rows, which the worker
can't check, so routing it would drop a guard. A routed customer it flips gets an evict, as does one a license op touched.

**scenarios** — migrations.run v1 (messages 100, words 25) → v2 with customize, routed
- messages 300, credits 40, words untouched
- add lands once
- remove an item only v2 has
- reminted $20 base price
- run canceled after a page committed

### 6 · [x] throttle, observability, perf run

**goal** — cap in-flight worker sends per page, log worker vs SQL writes per page, and measure a large run
**steps** — `BATCH_MIGRATION_WORKER_SEND_CONCURRENCY` (64) [x] · page log `failed`, `workerCurrent` and `worker_*` phase
timings [x] · abort the run after 25 sends in a row find the worker unreachable (`interrupted`) [x] · perf runs:
`benchRunPlanItemDelete` / `benchRunPlanItemReplace` / `benchRunVersionSet` with `BALANCE_WORKER_ROLLOUT_ENABLED=true` vs `false` on a `bun dw` stack [x]
**verify** — `bun test server/tests/perf/batch-migrations` · the bench comparison on a `bun dw` stack, results below. The staging
run of 100k routed customers was dropped in favour of the gradual prod rollout

**scenarios** — migrations.run remove messages, routed org
- 20k customers, 10% held by the worker
- 100k customers during steady track traffic

**result** · `bun dw`, one local worker with 4 partitions, Neon in eu-west-2, every run correct
- delete 100k: 575 s routed vs 226 s SQL (174 vs 443 customers/s), apply p50 48 ms and p99 148 ms, 0 failed, 0 fallback
- delete, replace and version set at 5k: 0 failed, 0 fallback; 400 stale replies in one 20k run all landed on the re-select
- delete 20k at send concurrency 16 / 32 / 64: 97.5 / 59.3 / 45.7 s, apply p99 186 / 173 / 173 ms, 0 failed, 0 fallback, 0 stale
- concurrency raised to 64: prod runs one migration chunk at a time (`migrationTaskQueue`, concurrency 1, no key), so 64 is
  the fleet-wide peak of sends in flight, about 1.6 per worker across 40, and one local worker held all 64

### 7 · not needed · cold apply

**goal** — a migration plan for a customer the worker doesn't hold lands without loading it
**verify** — repeat task 6's 100k run and compare subject map evictions and load latency

**decided** · not needed. Migrated customers are evicted at page end (the `is_custom` flip and the license pool repoint
evict them), so a run never leaves them resident and the subject map doesn't churn. A cold load is about 60% of a send,
so cold apply would only buy throughput. The remaining case, a migration that changes neither `is_custom` nor license
pools, is guarded by the subject map eviction counter in its own stacked PR
