---
author: john + claude
feature: balance-worker-eviction
date: 2026-09-24
status: draft, not yet approved
---

# Eviction on the balance worker path

Who tells the worker to forget a customer, when, and what the evict promises. Today the answer is
"every legacy cache invalidation, immediately, and it promises little". Units: `units.md`.

## What exists today

### one chokepoint, one line

```
invalidateCachedFullSubject({ ctx, customerId })       ~45 call sites + 2 middlewares
  ├ evictBalanceWorkerCustomer            POST /v1/evict to the owner, awaited, warn on failure
  ├ markCustomerUpdatedAt                 customer_lsns freshness mark
  └ per Redis target: flush/HDEL balance fields · UNLINK subject · INCR epoch
```

`deleteCachedFullCustomer` is a deprecated alias for it. `refreshCacheMiddleware` calls it after every
2xx on 33 routes (`refreshCacheConfigs.ts`), keyed on `ctx.customerId`; `stripeWebhookRefreshMiddleware`
after core Stripe events. Opt-outs: `ctx.skipSubjectCacheDeletion` (`preserveSubjectCache`, set by attach
when it returns a checkout URL or defers, and by `publishBillingTransition`) and
`ctx.testOptions.skipCacheDeletion`.

### what the worker's evict does

```
evict(customer)
  overtakeInFlightLoads      a load that began before the evict discards its result   (fixed 2026-09-21)
  waitForPendingCommits      the customer's mutations still waiting on Kafka
  subjects.evictCustomer     drop the map entry (pinned subjects drop on unpin)
```

It does **not** wait for the committer. A track answered on log durability leaves `pendingByCustomerKey`
at the Kafka ack (`settlePending`), so an evict right after it finds nothing to wait for, drops the copy,
and the next command hydrates from Postgres **before the record lands**. Memory then shows the pre-track
balance until the next evict (`plans/balance-worker-get-or-create/units.md` unit 0, "dropped for now").
`replyOnceStored` and a `store`-durable `reset` already wait on `writer.waitForStore()`, the partition-wide
store milestone; evict just doesn't use it.

### what a billing action does on the worker path

```
executeAutumnBillingPlan
  1 resolvePlanCatalog                                    PG, catalog rows
  2 writePlanRows
      routed?  applyBillingPlan → worker, replies once stored     customers · entities · cusProducts
               then withPlanTransaction(writePostgresOnlyRows)    cusPrices · cusEnts · rollovers
                 license updates · license pools (pool cusEnt + pooled_balances) · transitions
                 schedule phases · replaceables
      refused? withPlanTransaction(customer rows + postgres-only rows)   license seats · claims · no id
      stale?   writeCustomerRowsInPostgres                                 worker copy behind, resent once
  3 applyPlanRebalances                                   PG: cusEnt balance ± d (one-off, auto top-up)
  4 runPlanSideEffects                                    subscriptions · invoices · SQS · reconcileLicenseState
                                                          (reconcile calls deleteCachedFullCustomer itself)
… then refreshCacheMiddleware evicts the customer regardless
```

So an attach whose rows all went through the worker still evicts the copy the worker just wrote, and
the next track re-hydrates. Meanwhile the writes that genuinely bypass the worker get no evict of their
own; they are covered only by that blanket middleware evict, which webhook, cron and trigger callers of
the executor don't have (they each call `deleteCachedFullCustomer` by hand, or don't). The bypasses
around a plan, found by the call-site sweep:

- the refused lane and the stale fallback (whole plan in Postgres);
- `writePostgresOnlyRows`: `customer_licenses` and license pools — the worker **does** hold
  `customer_licenses`, `usage_windows` and `open_locks` (`readSubjectBaseline`), not only balances;
- `applyPlanRebalances`: one-off and auto top-up increments on `customer_entitlements`. Auto top-up
  evicts only when the plan inserted a cusEnt, so most top-ups change Postgres and the worker is never told;
- `publishBillingTransition`: raw-SQL carry-over on cusEnt balances, then `preserveSubjectCache`, which
  also switches off the middleware's evict — the worker is never evicted after that write;
- the deferred lane: `insertPendingCustomerProducts` before Stripe, `promotePendingCustomerProducts` on
  the webhook, both direct;
- `getOrCreateStripeCustomer`: `customers.processor` written directly from attach, setup_payment and the
  portal, with no invalidation anywhere.

Two more findings: cron callers (`runSeatSyncCron`, `expireOneOffCustomerProductResults`) evict with a
hand-built context that has no `id` or `timestamp`, so `requestContextToCommandBase` produces a command
the worker rejects and the evict only logs; and `/entities.update` is not in the refresh list, so a
config-only entity update patches Redis and never evicts.

Billing **setup** reads Postgres (`setupFullCustomerContext` → `CusService.getFull`). A track answered
10 ms earlier may not be in Postgres yet, so the plan is computed on a balance that misses it. `getFull`
only asks the worker when a reset is due (`resetCustomerEntitlementsViaWorker`, store-durable), which
happens to wait for the store — but only then.

### the batch writers

| writer | rows | Redis | worker |
|---|---|---|---|
| batch migrations, `invalidateBatchMigrationCaches` → `batchInvalidateCachedFullSubjects` | cusProducts, cusEnts for a page of customers | unlink + epoch, retried | **nothing** |
| reset cron SQL lane, `invalidateResetCaches` | cusEnt balance/next_reset_at, rollovers | HDEL fields | **nothing** |
| reset cron v1, `resetCustomerEntitlement` → `invalidateCustomerEntitlementBalance` | same | HDEL field | **nothing** |
| reset cron v2 worker lane, `enqueueWorkerResets` | through the worker (`queue.reset`) | — | n/a |

The queue has two doors, `track` and `reset`; the command consumer handles those two types.

### routing

`isBalanceWorkerRolloutEnabled()` is one env flag, on unless `"false"`. `runResetLoopV2` picks a lane
per sweep from it. `plans/balance-worker-routing.md` expects an edge config keyed by org and env, the
shape shadow uses; the rolling-rollouts machinery (`ctx.rolloutSnapshot`, `isSnapshotCacheStale`,
`changedAt`) is how the FullSubject rollout detected a crossed bucket and busted its cache
(`rollout-track-transition.test.ts`, `full-subject-cache-rollout.test.ts`).

## Target model

### the unit: a bypass write

A **bypass write** is a Postgres write of rows the worker holds, made outside the worker. That is the
one thing eviction exists for. Three rules follow:

1. **A write through the worker never evicts.** Routed plans, worker tracks, worker resets.
2. **Every bypass write ends with one evict of that customer, after its transaction commits.** The
   writer that knows it bypassed does it: the executor for a plan, the chokepoint for a legacy writer,
   the queue for a batch.
3. **An evict promises that the copy is gone and the worker's earlier writes have landed.** A reader
   after it sees Postgres as the worker left it.

And one rule for readers that decide something: **a decision-maker reading Postgres flushes first.**

**Invalidation never looks at the rollout flag.** The flag chooses where reads and writes go; every
invalidation busts both caches (Redis view + worker copy), and the worker client starts on every
server whatever the flag says. So a flip in either direction, mid-deploy or per org, never finds a
copy that predates the last write. What the flag-independent rule does *not* cover is a worker
track's deduction, which lives in the worker and Postgres only: rolling a customer back to Redis
needs that customer's Redis view dropped first (the handoff below), and rolling forward needs the
Redis balances flushed to Postgres first. Decided 2026-09-24.

### the verbs

```
worker
  evict     overtake loads → wait commits → wait store → drop            (rule 3; closes unit 0)
  flush     wait commits → wait store → { stored: true }                 new; the read side of evict
  queue.evict                                                            new door on the command topic

server
  evictBalanceWorkerCustomer({ ctx, customerId })     unchanged signature, now keeps rule 3
  flushBalanceWorkerCustomer({ ctx, customerId })     billing setup, before getFull
  queueBalanceWorkerEvicts({ customers })             batch writers
```

`flush` is `replyOnceStored`'s idle branch as a command: `waitForPendingCommits(customer)` then
`waitForStore()`. Partition-wide store completion is coarse but already what a store-durable reset
waits on; per-customer store tracking is not needed for this.

### who evicts, by writer

```
 writer                         evicts?                             where
 ────────────────────────────   ─────────────────────────────────   ─────────────────────────────────────
 routed billing plan            no                                  —
 plan that bypassed             yes, once, after its writes         executeAutumnBillingPlan (rule 2)
   refused lane · stale fallback · license/pool rows in writePostgresOnlyRows · applyPlanRebalances
 bypass beside the plan         yes, itself                         publishBillingTransition ·
                                                                    pending insert/promote ·
                                                                    getOrCreateStripeCustomer
 legacy direct writer           yes                                 invalidateCachedFullSubject, as today
 batch migration / SQL reset    yes, queued                         queue.evict from the batch invalidator
 refreshCacheMiddleware         per route: "evict" | "routed"       refreshCacheConfigs.ts
 Stripe webhook middleware      "evict" (its handlers are legacy writers)
```

`preserveSubjectCache` keeps meaning "don't drop the Redis view"; it never decides the worker evict.
A bypass writer inside a preserved request still evicts (rule 2), which is what `publishBillingTransition`
gets wrong today.

The middleware keeps its Redis invalidation for every route (non-routed customers still read Redis
during a partial rollout). Only its worker evict becomes route policy. Default is `"evict"`; a route
flips to `"routed"` when every write behind it goes through the worker or evicts itself.

**Why the executor, not a ctx flag.** The executor is the one place that knows a plan bypassed, and it
runs from routes, webhooks, crons and triggers alike; a ctx flag consumed by the route middleware covers
only the first. It also keeps the evict after the transaction — `writePostgresOnlyRows` runs inside
`withPlanTransaction`, and an evict inside a transaction makes the worker hydrate uncommitted rows.

### where the chokepoint ends up

`invalidateCachedFullSubject` keeps its evict for now (the ~45 legacy writers are correct by default).
Each writer that becomes a plan facet leaves the chokepoint; when none remain, the evict line goes and
the function is Redis-only again. That is the "keep the structure, remove slowly" path, with the
executor and the route policy as the two places routed work already opts out.

### rollout transitions

Routing becomes per (org, env) with a customer bucket, per `plans/balance-worker-routing.md`. A
customer whose bucket crossed since `changedAt` gets a one-time handoff on its next request:

```
forward  Redis → worker    invalidateCachedFullSubject({ flushBalances: true })   Redis balances land in PG
                           then the first worker command hydrates
back     worker → Redis    flush + evict                                          worker writes land in PG
                           then the first Redis read hydrates
```

The reset cron picks its lane per row, not per sweep. `isBalanceWorkerRolloutEnabled` takes the identity.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Evict waits for the store? | Yes, always; no durability option. Partition-wide `storeCompletion`, bounded by flush cadence. Closes get-or-create unit 0. Done 2026-09-24. |
| 2 | Where does billing flush: the lock or setup? | `setupFullCustomerContext`. The lock covers HTTP routes only; setup is every billing action's read. |
| 3 | Who evicts after a bypassing plan: executor or ctx flag + middleware? | Executor (see above). |
| 4 | Route policy default | `"evict"`. Flip billing, customers.create, get_or_create, entities.create to `"routed"` in their units. |
| 5 | Batch evicts: N HTTP calls or a queued command? | Queued. Consumed in log order by the owner, after any earlier queued tracks; same shape as `queue.reset`. |
| 8 | Gate invalidation on the rollout flag? | No, never. Evicts, queued evicts and catalog invalidations run regardless; the client always starts. Done 2026-09-24. |
| 6 | `applyPlanRebalances` | A bypass until apply-plan unit 4 moves it onto the worker; counted as one. |
| 7 | Evict inside a transaction | Never. The executor evicts after `writePlanRows` returns. |

## Open questions

- Is the v1 reset loop (`runResetLoop`, edge config `resetJob.enabled`) still on anywhere? Its
  `resetCustomerEntitlement` writes cusEnts and only HDELs a Redis field.
- `prepareUsageLimitUsage` flushes Redis before a primary read and writes nothing; whether it needs the
  worker's usage-window counters landed first is the same question as billing setup (unit 3).

## Call-site inventory (sweep of 2026-09-24)

55 sites: 44 direct calls of `deleteCachedFullCustomer` / `invalidateCachedFullSubject` and 31 routes in
`refreshCacheConfigs.ts` (3 dead: `POST /customers/:id/entitlements/:ceid`, `POST /subscriptions/update`,
`POST /billing/attach`). No call site is gated on the rollout flag. `$S` = `server/src`.

### direct Postgres writers of worker-held rows (evict stays; each is a future plan facet)

| domain | site | rows |
|---|---|---|
| customers | `$S/internal/customers/actions/update/updateCustomer.ts:247` | `customers`, `usage_windows`; invalidates only with usage windows, else the middleware |
| customers | `$S/internal/customers/actions/deleteCustomer.ts:58` | `customers` delete + cascades |
| entities | `$S/internal/entities/actions/updateEntity.ts:107` | `entities`, `usage_windows`; config-only updates never evict (route not listed) |
| entities | `handleCreateEntity/createEntityForCusProduct.ts:217`, `autoCreateEntity.ts:128` | legacy lane: cusEnt decrement, `entities` map, `entities` insert |
| entities | `DELETE …/entities/:eid`, `/entities.delete` (middleware) | `CusEntService.update/increment`, `EntityService.deleteInInternalIds` |
| balances | `recalculateBalance.ts:45`, `deleteBalance.ts:133`, `applyThresholdBlock.ts:48` | cusEnt columns, `customer_products.status` |
| balances | `autoTopup.ts:182-183` | plan through the worker + direct `autoTopupRebalance` increments |
| balances | `syncCustomerEntitlementAnchors.ts:213,218` | cusEnt anchors, `pooled_balances.reset_cycle_anchor` |
| balances | `/balances.create`, `/balances.update`, `/balances.delete`, `POST /customers/:id/balances` (middleware) | cusEnt inserts, Redis Lua + `syncItemV4`, deductions |
| billing | `resetPooledBalances.ts:59`, `applyPooledBalanceCustomerProductTransitions.ts:89` (3×) | pool cusEnts, `pooled_balances`, contributions |
| billing | `executeDeferredBillingPlan.ts:115` | plan + `promotePendingCustomerProducts` (direct); skipped when the transition preserved the cache |
| billing | `expirePendingPlanForVoidedInvoice.ts:59`, `revertTrialExpiry.ts:111` | `customer_products` status, raw updates |
| billing | `/licenses.attach`, `/licenses.release`, `/billing.setup_payment`, `POST /cancel`, `POST /customers/:id/transfer`, `POST /attach` (v1) | seats always refuse the worker; `customers.processor`; `expireIfPending`; transfers; legacy attach |
| webhooks | `stripeWebhookRefreshMiddleware.ts:107`, `runStripeWebhookReplay.ts:105`, `revenuecatWebhookRefreshMiddleware.ts:32` | many direct handlers (`syncCustomerProductStatus`, renew/cancel, prepaid, allocated, checkout link-back) |
| webhooks | `handleStripeCustomerUpdated.ts:50`, `handleStripeInvoiceMetadata.ts:55,67`, `processConsumablePricesForInvoiceCreated.ts:507`, `processConsumablePricesForSubscriptionDeleted.ts:142` | `customers` name/email; legacy v1 flows; cusEnt batch resets (rollover insert lands *after* the evict at :526) |
| crons | `runSeatSyncCron.ts:163`, `expireOneOffCustomerProductResults.ts:65` | raw seat updates, one-off expiry; **evict command invalid** (no ctx id/timestamp) |
| migrations | `migrateRevenuecatCustomer.ts:90`, `migrateCustomer.ts:105` | expire + `createFullCusProduct` |
| rewards | `grantRewardEntitlements.ts:140`, `triggerFreeProduct.ts:124,142`, `/rewards.redeem` | cusEnt insert, legacy `createFullCusProduct` |
| invoices | `applyReissueCustomerOverrides.ts:119` | `customers` name/email |
| licenses | `reconcileLicenseState.ts:66` | `customer_licenses` raw SQL (worker-held), seat expiry, pooled transitions; runs as a plan side effect |

### routed (evict is redundant except for the bypasses listed under "what a billing action does")

`sync.ts:98`, `flash.ts:43` (existing-customer `CusService.update` at `setupFlashContext.ts:129` is direct),
`rollback.ts:16`, `confirmCheckout.ts:198`, `processExpiredTrialRow.ts:115` (a seat forces the Postgres
lane), `executeMigrateCustomerPlan.ts:39`; routes `/billing.attach`, `/billing.update`,
`/billing.multi_attach`, `/billing.create_schedule` (+ schedule phases), `/billing.import`, `/billing.sync`,
`/billing.sync_v2`, `/entities.create`, `POST /customers/:id/entities` (claims, seats, replaceables and
rebalances still bypass).

### rows the worker never holds (evict is noise)

`insertInvoices.ts:245`, `reissueInvoice.ts:911`, `executeStripeInvoicePlan.ts:114`,
`executeStripeBillingPlanRollback.ts:66`, `recordRevenueCatInvoice.ts:84`, `refundRevenueCatInvoice.ts:58`
— all `invoices`.

### Redis-only / no write

`syncItemV4.ts:54` (sync conflict), `runMigrationCustomerTask.ts:87`, `handleClearCustomerCache.ts:19`
(its `customer_ids` branch uses the batch helper, which never evicts), `prepareUsageLimitUsage.ts:62`.

### writers with no invalidation at all

`getOrCreateStripeCustomer.ts:93` and `stripeCusUtils.ts:162` (`customers.processor`);
`updateCustomerData.ts:63`, `cusUtils.ts:65`, `updateEntity.ts:92` (write then Redis patch only);
`handleUpsertInstallation.ts:92`; `executeAutoTopupRebalance.ts:25`; `persistPublishedBalanceTransitions.ts:36`;
`migrations/v2/batchOperations/*` (batch helper, no evict); `insertPendingCustomerProducts.ts`,
`inheritPendingCreatedAt.ts`, `relinkPendingPayment.ts`; `cron/resetCron/resetCustomerEntitlement.ts`.
Routes that write and are not in the refresh list: `/entities.update`, `/billing.multi_update`,
`/billing.restore`.
