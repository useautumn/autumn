# Units of work

Each unit is end to end and ends on a passing test; stop for review after each.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **The snapshot holds every rollout; the flip is scheduled.** `RolloutSnapshot` becomes `{ customerBucket, rollouts: Record<rolloutId, RolloutSnapshotEntry> }`; `computeRolloutSnapshot` fills every entry. New `resolveRolloutDecision({ rolloutId, orgId, customerId, now })` → `{ enabled, crossed, effectiveAt }` with `effectiveAt = changedAt + ROLLOUT_SETTLE_MS`; `isSnapshotCacheStale` compares against `effectiveAt`. Rollout store `retainOnError: true`; `deleteRollout` refuses `percent > 0`. `v2-cache` consumers and the two dead transition tests removed. | unit: decision before/after effectiveAt, crossed forward/back/none, org override beats global, retainOnError keeps the last config through an S3 error. |
| 2 | **One routing function behind every gate.** `isBalanceWorkerRolloutEnabled({ ctx, customerId })`: snapshot memo for that customer, else the store (rule 1); `resolveBalanceWorkerRouting({ orgId, customerId })` for cron rows. `attachRolloutToContext` at every customer-binding site in the coverage map (api router, stripe ×3, revcat, vercel, checkout, SQS `createWorkerContext`, trigger, migrate-customer). All twenty gates replaced; the cache refuses routed customers (rule 2) and `skipCache` leaves `baseMiddleware`; `handleCheck.failOpen.skip` per customer; batch track split per item; `billingPlanRoutesToWorker` takes ctx; queued `UpdateBalance` through `runUpdateBalance`; test-clock reset through the lazy-reset gate. Finalize flag-free (PG lock row, else Redis receipt). Reset cron lane per subject; lock sweep always on. Env var deleted. Lands as two stacked branches: request paths, then SQS / trigger / cron / webhook paths. | integration: two orgs on one server, one at 100% and one at 0% — track/check/customers.get/attach take the worker for one and Redis for the other (assert via the routed log field and the Redis key's presence). One org at 50%: a customer in bucket <50 routes, one ≥50 does not. Reset cron with both lanes in one page. Finalize of a Redis-taken lock after the org rolled forward. |
| 3 | **Forward handoff.** `ensureBalanceWorkerHandoff({ ctx })` in `rolloutMiddleware` and the customer-aware context factories: crossed forward + Redis view older than `effectiveAt` → `invalidateCachedFullSubject({ flushBalances: true, strict: true })`; on failure the request runs legacy. `syncItemV4` evicts the worker after syncing a routed customer. | integration mirroring `rollout-track-transition`: org at 0%, track 10 (Redis, unsynced), flip to 100%, wait for `effectiveAt`, track 10 (worker) → `customers.get` shows 80 and Postgres shows 80. A queued Redis sync that lands after the flip leaves the worker's next check correct. |
| 4 | **Back handoff.** FullSubject read path: crossed back + view older than `effectiveAt` → drop; inside `effectiveAt + HYDRATION_HOLD_MS` → the request runs with `skipCache` (Postgres lane, no view); after the hold, before hydrating → strict `flushBalanceWorkerCustomer` + evict, bounded, logged on failure. No worker change. | integration: 100% → track (worker) → flip to 0% → track inside the hold (Postgres lane, no Redis key) → track after the hold (Redis) → balances exact at each step. Then: a worker track sent just before `effectiveAt` whose commit lands during the hold is in the first hydrated view. |
| 5 | **Operator surface.** Admin UI: the `balance-worker` rollout pre-created, `effectiveAt` countdown, delete refused at non-zero. Log fields from the overview. `bun balance-routing status <org>` prints the decision, bucket split and last handoff counts from Axiom. | admin route unit tests; one manual run against staging recorded in this file. |

Order: 1 → 2 → 3 → 4 → 5. Unit 2 is the big diff and should land in two stacked branches (request-path gates, then cron/webhook gates).

## Folder structure

```
server/src/internal/misc/rollouts/
├── rolloutSchemas.ts                       unchanged
├── rolloutConfigStore.ts                   retainOnError, delete guard
├── rolloutUtils.ts                         computeRolloutSnapshot (map), resolveRolloutDecision, isSnapshotCacheStale
├── balanceWorker/
│   ├── balanceWorkerRolloutId.ts           `"balance-worker"`
│   ├── isBalanceWorkerRolloutEnabled.ts    ({ ctx, customerId }) snapshot memo, else the store
│   ├── resolveBalanceWorkerRouting.ts      ({ orgId, customerId }) pure
│   ├── attachRolloutToContext.ts           snapshot entry + forward handoff; every customer-binding site calls it
│   └── ensureBalanceWorkerHandoff.ts       forward handoff, idempotent, strict flush
server/src/honoMiddlewares/rolloutMiddleware.ts        attachRolloutToContext for the api router
server/src/internal/customers/cache/fullSubject/actions/getCachedFullSubject.ts   back handoff before hydrate
server/src/internal/balances/utils/sync/syncItemV4.ts                            evict worker after a routed sync
server/src/internal/balances/finalizeLock/runFinalizeLock.ts                     flag-free lookup
server/src/internal/balances/batchReset/runResetLoopV2.ts                        lane per subject
packages/env/src/balanceWorker/balanceWorkerConstants.ts                          ROLLOUT_SETTLE_MS, HYDRATION_HOLD_MS
server/src/external/balanceWorker/getBalanceWorkerRolloutEnabled.ts              deleted
```

## Unit 1 case matrix

`resolveRolloutDecision({ rolloutId, orgId, customerId, now })` over a config entry `{ percent, previousPercent, changedAt, orgs }`:

| # | config | customer | now | enabled | crossed |
|---|---|---|---|---|---|
| 1 | no entry for the id | any | any | false | null |
| 2 | 0 → 100, changedAt T | bucket 40 | T + 5s (inside settle) | false | null |
| 3 | 0 → 100, changedAt T | bucket 40 | T + 30s | true | forward |
| 4 | 100 → 0, changedAt T | bucket 40 | T + 30s | false | back |
| 5 | 20 → 50, changedAt T | bucket 15 | T + 30s | true | null (was on, still on) |
| 6 | 20 → 50, changedAt T | bucket 70 | T + 30s | false | null (was off, still off) |
| 7 | global 0, org override 100 | bucket 40 | T + 30s | true | forward |
| 8 | global 100, org override 0 | bucket 40 | T + 30s | false | back |
| 9 | percent 100 | no customerId | any | true | null |
| 10 | percent 50 | no customerId | any | false | null |
| 11 | changedAt 0 (never changed) | any | any | by percent | null |

`computeRolloutSnapshot` holds one entry per rollout id; `isSnapshotCacheStale` on an entry uses `effectiveAt`.
Store: `retainOnError: true` keeps the last good config through an S3 read error; `deleteRollout` throws when
the entry or any org override has `percent > 0`.
