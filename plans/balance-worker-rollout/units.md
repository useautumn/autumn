# Units of work

Each unit is end to end and ends on a passing test; stop for review after each.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **The snapshot holds every rollout; the flip is scheduled.** `RolloutSnapshot` becomes `{ customerBucket, rollouts: Record<rolloutId, RolloutSnapshotEntry> }`; `computeRolloutSnapshot` fills every entry. New `resolveRolloutDecision({ rolloutId, orgId, customerId, now })` → `{ enabled, crossed, effectiveAt }` with `effectiveAt = changedAt + ROLLOUT_SETTLE_MS`; `isSnapshotCacheStale` compares against `effectiveAt`. Rollout store `retainOnError: true`; `deleteRollout` refuses `percent > 0`. `v2-cache` consumers and the two dead transition tests removed. | unit: decision before/after effectiveAt, crossed forward/back/none, org override beats global, retainOnError keeps the last config through an S3 error. |
| 2 | **One routing function behind every gate.** `isBalanceWorkerRolloutEnabled({ ctx, customerId })`: snapshot memo for that customer, else the store (rule 1); `resolveBalanceWorkerRouting({ orgId, customerId })` for cron rows. `attachRolloutToContext` at every customer-binding site in the coverage map (api router, stripe ×3, revcat, vercel, checkout, SQS `createWorkerContext`, trigger, migrate-customer). All twenty gates replaced; the cache refuses routed customers (rule 2) and `skipCache` leaves `baseMiddleware`; `handleCheck.failOpen.skip` per customer; batch track split per item; `billingPlanRoutesToWorker` takes ctx; queued `UpdateBalance` through `runUpdateBalance`; test-clock reset through the lazy-reset gate. Finalize flag-free (PG lock row, else Redis receipt). Reset cron lane per subject; lock sweep always on. Env var deleted. Lands as two stacked branches: request paths, then SQS / trigger / cron / webhook paths. | integration: two orgs on one server, one at 100% and one at 0% — track/check/customers.get/attach take the worker for one and Redis for the other (assert via the routed log field and the Redis key's presence). One org at 50%: a customer in bucket <50 routes, one ≥50 does not. Reset cron with both lanes in one page. Finalize of a Redis-taken lock after the org rolled forward. |
| 3 | **Done 2026-09-25, simple form.** **Forward handoff.** The worker reads a slightly stale Postgres at flip time; the one thing that must not happen is a late Redis sync overwriting what the worker has since acked. `syncItemV4` drops the sync for a routed customer (`skipped / customer_on_worker`). The explicit pre-flush (flush Redis balances before a crossed customer's first worker command) was deliberately not built: it needs a call at ~11 worker adapters to save at most ~3s of Redis tracks per crossing. | unit: a routed customer's sync writes nothing and reads no cache. |
| 4 | **Deferred 2026-09-25.** **Back handoff.** What ships: the pre-flip Redis view is evicted on its first read after the rollback settles (`isRolloutCacheStale`, crossed back), and Redis rehydrates from Postgres. Not built: the worker flush before hydration and the hydration hold. Cost: a worker commit still landing after Redis hydrated is one track Redis does not see until the next invalidation, the same class as the forward flip. | existing unit coverage of the stale check (forward then back, once per flip). |
| 5 | **Done 2026-09-25.** **Operator surface.** Admin page rebuilt as the balance-worker rollout (`vite/src/views/admin/edge-config/`): one global percent with a live "X% → Y% in Ns" status, per-org overrides as a list, add/edit/remove; `GET /admin/rollouts` returns `activeRolloutId` and `settleMs`. Delete guard, `balance_worker_rollout_enabled` log field, `customer_on_worker` sync skip reason. `rollout-track-transition.test.ts` is real: it proves the lane per phase from the Redis view's `_cachedAt`; it runs only against a server on `BALANCE_WORKER_ROLLOUT_ENABLED=config`. Left: an Axiom query per org for routed requests and `customer_on_worker` skips after a flip. | the transition test green on a config-driven local stack. |

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

`isRolloutEnabled` and `isRolloutCacheStale` (`{ rolloutId, orgId, customerId, now }`) over a config entry `{ percent, previousPercent, changedAt, orgs }`:

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
