---
author: john + claude
feature: balance-worker-rollout
date: 2026-09-25
status: approved 2026-09-25; units 1-3 landed, 4 deferred, see units.md
---

# Rolling the balance worker out per org, per env, per customer bucket

Owns `plans/balance-worker-routing.md` (stub) and unit 6 of `plans/balance-worker-eviction/`. Units: `units.md`.

## What exists today

### one env flag, twenty gates

`isBalanceWorkerRolloutEnabled()` is `process.env.BALANCE_WORKER_ROLLOUT_ENABLED !== "false"` — no org, no env,
no customer (`server/src/external/balanceWorker/getBalanceWorkerRolloutEnabled.ts:7`). Twenty sites read it:

```
 gate                                            identity in scope                 file
 ─────────────────────────────────────────────   ──────────────────────────────    ────────────────────────────────────────────
 skipCache for every request                     none: runs before auth            honoMiddlewares/baseMiddleware.ts:148
 check → worker | Redis Lua; failOpen.skip       ctx, body.customer_id             api/check/handleCheck.ts:34,68
 track → worker | Redis Lua (sync + async)       ctx, body.customer_id             balances/handlers/handleTrack.ts:44
 batch track → worker queue | Redis              ctx, one customer PER ITEM        balances/handlers/handleBatchTrack.ts:21
 set usage / update balance                      ctx, params.customer_id           handleSetUsage.ts:24, runUpdateBalance.ts:27
 finalize → PG lock row | Redis receipt          ctx; customer known only after    finalizeLock/runFinalizeLock.ts:18,
                                                 the lock row is loaded            runQueuedFinalizeLock.ts:17
 lazy reset in getFull → worker | SQL            ctx, fullCus.id                   customers/CusService.ts:294
 customers.get / entities.get / get_or_create    ctx, customerId                   *ByRollout.ts ×3
 billing plan rows → worker | one PG txn         NO ctx (caller has it)            billingPlan/routing/billingPlanRoutesToWorker.ts:54
 auto top-up read → worker | cache               ctx, customerId                   balances/getBillableFullCustomer.ts:55
 reset cron lane, once PER SWEEP                 CronContext only; row has         batchReset/runResetLoopV2.ts:54
                                                 internal ids, no org/env/customer
 lock sweep on/off                               CronContext; rows carry           lockSweep/runLockSweepLoop.ts:16
                                                 org_id, env, customer_id
```

Always legacy, no gate: queued `UpdateBalance` (`processMessage.ts:322`), track-tokens routes, `/customers/:id/balances`,
test-clock reset. Always worker, no gate (by design, eviction plan decision 8): evict, flush, queued evicts, catalog
invalidation.

### the rollout machinery the FullSubject cache used

`admin/rollout-config.json` on S3, polled every 10s fleet-wide (timestamp object), per-request snapshot on
`ctx.rolloutSnapshot`, bucket = `Bun.hash(customerId) % 100`, staleness = bucket crossed between `previousPercent`
and `percent` **and** the cache entry predates `changedAt` (`rolloutUtils.ts:96`). Admin routes + UI exist
(`/admin/rollouts/:id[/orgs/:org]`, `EdgeConfigView.tsx`). Three things stop it being reused as is:

- `computeRolloutSnapshot` freezes only `entries[0]` — one rollout at a time (`rolloutUtils.ts:73`);
- the store fails open to `{ rollouts: {} }` on an S3 error and `deleteRollout` skips eviction: both send every
  customer back to Redis with no handoff;
- the `v2-cache` rollout it served is over (`isFullSubjectRolloutEnabled` is hardcoded `true`, v1 deleted
  2026-07-28); its transition tests still run but test nothing.

### what the two paths leave behind

```
 path      writes                       reaches Postgres                         cache
 ────────  ───────────────────────────  ───────────────────────────────────────  ───────────────────────────
 Redis     Lua on balance hashes        syncItemV4: 1s in-process batch → SQS →  FullSubject view + hashes,
                                        consumer RE-READS the live hash          3-day TTL, _cachedAt = load time
 worker    memory → Kafka → committer   flush waits commits + store (PG landed)  worker memory only; Redis untouched
```

Two facts the handoff design rests on (both verified 2026-09-25):

- **`syncItemV4` reads the hash, not the message.** A queued sync for a hash that was GETDEL'd is a no-op
  (`syncItemV4.ts:120`). So flushing Redis balances *and* deleting the hash in one Lua call
  (`getDelSharedBalanceFields.lua`) is what `invalidateCachedFullSubject({ flushBalances: true })` already does.
- **The worker never bumps `cache_version`** (`workerCustomerEntitlement.ts:17` omits it), and it stays that way.
  A Redis view that predates a worker commit would sync an older absolute balance over it, so the design below
  never lets such a view exist: the cache side decides when it is safe to hydrate.

## Target model

### the unit: a routing decision for one subject

```
resolveBalanceWorkerRouting({ orgId, customerId, now })
  → { enabled, crossed: "forward" | "back" | null, effectiveAt }
```

One pure function over the edge config; every gate consumes it, either through the per-request snapshot
(`ctx.rolloutSnapshot.rollouts["balance-worker"]`) or directly where there is no ctx (cron rows). No gate
reads the env var again. The worker and herald never read it: they serve whatever arrives.

**One rollout id, `balance-worker`, env-agnostic.** An org's percent covers both its envs; the bucket is
`hash(customerId)`, so the same customer id lands on the same side in sandbox and live. Zero schema change,
the admin UI works as is, per-org override as today. `env` stays in the routing params only because the
identity the worker is keyed by carries it.

### the flip is scheduled, not immediate

```
effectiveAt = changedAt + ROLLOUT_SETTLE_MS     (15s in production, past the 10s config poll; 5s locally)
before effectiveAt: route by previousPercent    after: route by percent
```

Every pod computes the same instant from the same config, so the fleet flips together (clock skew, not poll
skew). This shrinks the "two paths writing the same customer" window from ≤10s to the requests already in
flight, without a drain state or a new field. The admin UI shows the countdown.

### the handoff, per direction, on the first request after the flip

`crossed` is `(bucket < previousPercent) !== (bucket < percent)` with `now ≥ effectiveAt`. Both handoffs are
idempotent, so "first request" needs no bookkeeping: they run whenever a crossed customer still has a copy that
predates `effectiveAt`.

```
forward   Redis → worker         where: rolloutMiddleware / context factories, before the first routed command
  1 Redis view exists with _cachedAt < effectiveAt?  else nothing to do
  2 invalidateCachedFullSubject({ flushBalances: true, strict: true })
      GETDEL balance hashes → sync_balances_v2 inline → UNLINK view → epoch++ → worker evict
  3 flush failed?  serve THIS request on the legacy path, log, retry next request
  race   a Redis track already in flight on another pod lands after 2: its sync hits a live hash again
         (rehydrated from the flushed PG row) and writes an absolute balance the worker's memory doesn't
         know. Bounded to in-flight requests at effectiveAt. Closed by syncItemV4 treating a routed customer
         as a bypass write: sync, then evict the worker (eviction plan rule 2).

back      worker → Redis         where: the FullSubject read path, where the old stale check lives
  1 Redis view exists with _cachedAt < effectiveAt?  drop it (isSnapshotCacheStale, as today)
  2 now < effectiveAt + HYDRATION_HOLD_MS (5s)?  serve this request with skipCache: the legacy Postgres
    lane, no view built, no Lua. Every pod stopped routing to the worker at effectiveAt, so a worker
    track can only still be in flight for one request latency; the hold outlasts it.
  3 after the hold, before hydrating from Postgres: flushBalanceWorkerCustomer strict (wait commits +
    store), then evict. The worker is unreachable? hydrate after the bounded attempt; log
    `handoff_back_unflushed`.
  The worker changes nothing: flush and evict already exist. A stale Redis view can never form because
  nothing is cached until the worker's writes have landed.
```

What this deliberately does not promise: a Redis track in flight at `effectiveAt` on the forward flip may be lost
(its sync is dropped or overwritten). John accepted "a couple of tracks" on 2026-09-25. Everything else is exact,
and all of it lives on the server: the rollout snapshot, the middleware, the FullSubject read path and the sync
consumer. The worker and herald are not touched.

### gates without a customer

```
 gate                    change
 ──────────────────────  ─────────────────────────────────────────────────────────────────────────────
 skipCache               deleted from baseMiddleware; the cache itself refuses routed customers (rule 2 below)
 finalize                flag-free: PG lock row, else Redis receipt. A lock lives where it was taken; both
                         stores are keyed by lock_id, so the routing at finalize time is irrelevant
 batch track             split the body per item into a worker list and a Redis list; two runs, one response
 billing plan            billingPlanRoutesToWorker({ ctx, autumnBillingPlan }): customer from the plan
 reset cron              lane per subject, after getResetSubjects resolves org/env/customer; a page yields
                         worker resets + SQL resets, not one lane per sweep
 lock sweep              always on: the balance_locks table is empty unless someone is routed
 stripe / revcat         set ctx.customerId + snapshot BEFORE the first CusService.getFull, not after
 queued UpdateBalance    goes through runUpdateBalance like the sync path (today it bypasses the gate)
```

### the config store

`retainOnError: true` for the rollout store (an S3 blip must not flip the fleet), and `deleteRollout` refuses a
non-zero percent (delete = set 0 → handoff → wait → delete). Both are one-line changes with tests.

## Coverage: every entry point

Hono middleware is only one of the places a context is born. The design does not depend on the middleware
having run; it depends on three rules that hold wherever a context exists.

### rule 1: the decision never needs the middleware

```
isBalanceWorkerRolloutEnabled({ ctx, customerId })
  snapshot on ctx for THIS customerId?   → use it                       (frozen per request)
  else                                   → resolveBalanceWorkerRouting({ orgId: ctx.org.id, customerId })
                                            from the store, right now
```

The snapshot is a memo keyed by customer id, never trusted blindly: a context that inherited another
customer's snapshot (`createMigrateCustomerRunContext.ts:23` does today) or was built org-only
(`createWorkerAutumnContext`, `setupBatchResetContext`, trigger tasks without a customer) resolves from the store.
Contexts with no `AutumnContext` at all (`CronContext`) call `resolveBalanceWorkerRouting` per row. Every gate
passes the customer explicitly; no gate reads a global.

### rule 2: the cache refuses routed customers

`getCachedFullSubject` / `getCachedPartialFullSubject` ask the same decision before serving a view: routed →
return nothing, the read goes to Postgres (or the worker, at the `*ByRollout` gates). This replaces the
`skipCache` hack in `baseMiddleware.ts:148`, and it is where the back handoff lives (drop the pre-flip view,
hold, flush, then hydrate). Any path that reads the cache is covered without knowing about the rollout.

### rule 3: the forward handoff runs where a context binds its customer

`attachRolloutToContext({ ctx, customerId })` = compute the snapshot entry + run the forward handoff when
crossed. It is called at the moment a path learns which customer it is about. Where a path reaches a worker
gate without it, the first worker command hydrates from Postgres without the last ≤3s of unsynced Redis
deductions; `syncItemV4` then lands them and evicts the worker (the bypass-write rule), so Postgres is right
and the worker re-hydrates. That is the accepted "couple of tracks" class, not a correctness hole.

### the map

```
 entry point                              context born             customer bound              what changes
 ───────────────────────────────────────  ───────────────────────  ─────────────────────────   ─────────────────────────────────────────
 api router (/v1, rpc)                    baseMiddleware           resolveCustomerId           rolloutMiddleware = attachRolloutToContext (exists, extended)
 internal router (dashboard, admin)       baseMiddleware           none                        nothing: dashboard writes go through /v1 (secretKeyMiddleware falls back to
                                                                                                the session); the one reachable gate is getFull's lazy reset, rule 1
 public / cli / autumn-webhook / trmnl    baseMiddleware           none                        nothing: no worker gate reachable without a customer; rule 1 covers any that is
 stripe webhooks (connect + legacy)       seeder middleware        stripeToAutumnCustomer:79   attach BEFORE CusService.getFull (:46, a gate), not after
 stripe webhook replay (SQS)              createWorkerContext      runStripeWebhookReplay:63   attach at :63
 stripe test clock ready                  handleStripeTestClock:42 per customer in the loop    attach per customer; its unconditional SQL reset (:59) becomes the lazy-reset gate
 stripe webhook refresh middleware        —                        —                           already evicts unconditionally (eviction plan decision 8)
 revenuecat webhooks                      revenueCatMiddleware     resolveRevenuecatRes:555    attach before getOrCreateCustomer/getFull (:229), not at the end
 vercel                                   vercelSeederMiddleware   vercelLogContext:96         attach at :96; plans route has no customer, nothing to do
 checkout                                 checkoutMiddleware:128   at construction             attach
 SQS jobs (processMessage)                createWorkerContext:53   payload.customerId          attach in createWorkerContext when the payload names one:
   Track / UpdateBalance / ExpireLock                                                            yes → gated per customer (queued UpdateBalance joins runUpdateBalance)
   FinalizeLock                                                    often none                   flag-free after unit 2 (PG lock row, else Redis receipt)
   AutoTopUp                                                       yes                          getBillableFullCustomer gate takes ctx
   SyncBalanceBatch / SyncCustomerDirty                            per item                     syncItemV4 resolves per customer; routed → sync then evict worker
   BatchResetCustomerEntitlementsV2                                per org+env                  SQL lane only; routed rows never reach it (lane chosen per subject upstream)
   StripeWebhookReplay                                             later                        see stripe replay
 trigger.dev tasks (createTriggerContext) with optional customerId                              attach when given (migrate-customer, warm-cache); batch migration
                                                                                                operations write Postgres and queue evicts unconditionally, no routing needed
 crons (CronContext, no AutumnContext)
   reset loop v2                          runResetLoopV2           row → getResetSubjects       lane per subject via resolveBalanceWorkerRouting; a page yields both lanes
   lock sweep                             runLockSweepLoop         rows carry org/env/customer  always on; confirmExpiredLocks already routes by the lock row
   seat sync, one-off expiry              hand-built ctx           argument                     unchanged: they evict unconditionally (evict command fixed in eviction unit 1)
   expired trials (createWorkerAutumnCtx) org-only                 plan's customer              billingPlanRoutesToWorker({ ctx }) resolves from the plan's customer (rule 1)
 migrate-customer run context             inherits parent          yes                          attach with its own customer (fixes the inherited-snapshot bug)
 postgres replay hydration, shadow script operator                 yes / none                   rule 1
 herald, balance worker                   none                     —                            nothing: they serve what arrives and never route
```

Always-legacy paths that stay legacy on purpose (they write Postgres and evict): track-tokens routes,
`/customers/:id/balances`, `handleUpdateBalancesV2`, `deleteBalance`. Always-worker paths that stay unconditional
(they are invalidations, not routing): evict, flush, queued evicts, catalog invalidation.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Percent per customer, splitting one org across both write paths? | Yes. The worker is customer-keyed; pools, entities, licenses all hang off the customer. Nothing spans customers on the worker side. `routing.md`'s "org+env is the unit" predates the handoff design. |
| 2 | Env scope? | None. One id, `balance-worker`; an org rolls both envs together (decided 2026-09-25). |
| 3 | Scheduled flip (`effectiveAt`) or immediate? | Scheduled: 15s in production, 5s locally. Immediate keeps a 10s poll-skew window on every flip. |
| 4 | Worker bumps `cache_version` so a stale Redis sync self-heals? | No (John, 2026-09-25): the worker stays isolated. Rollback safety is the cache's job: the hydration hold plus the strict flush mean a pre-commit view is never built. |
| 5 | Strict flush/evict variants or reuse best-effort? | Strict for the handoff only (`strict: true` option; throws instead of warn). Best-effort stays for every other caller. |
| 6 | Forward handoff site: middleware or each gate? | Neither, in the end: no explicit pre-flush was built (see units.md unit 3). The worker reads a slightly stale Postgres and `syncItemV4` drops a routed customer's late sync. |
| 7 | Retire `v2-cache` machinery? | Yes in unit 1: `isFullSubjectRolloutEnabled`, `getFullSubjectRolloutSnapshot`, the two dead transition tests, `FULL_SUBJECT_ROLLOUT_ID`. The snapshot becomes a map so both could coexist, but nothing needs the old one. |

## Open questions

- `getDelSharedBalanceFields` uses the customer-level view as its manifest; entity-level hashes with no
  customer view are not flushed. Confirm whether an entity's balances can outlive its customer view (3-day TTL
  both) before relying on it for the forward handoff.
- Settle window: derived, constant in `rolloutUtils.ts`; the admin page reads it from `GET /admin/rollouts`.
- The Redis migration staleness check (`isRedisMigrationCacheStale`) is a sibling; leave it alone.

## Observability

Every request logs `balance_worker_routed`, `balance_worker_bucket`, `balance_worker_handoff` (forward | back |
null) and `balance_worker_handoff_failed`. One Axiom query per org: routed requests that hit a legacy writer
(should be zero), handoffs per minute after a flip (should spike then drop to zero).
