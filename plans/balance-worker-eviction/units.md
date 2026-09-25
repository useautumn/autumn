# Units of work

Each unit is end to end and ends on a passing test; stop for review after each.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **Done 2026-09-24.** **Evict keeps its promise; `flush` exists.** Worker `evict` waits `waitForStore()` after the commits. New `flush` command: engine type + parser, processor (`waitForPendingCommits` → `waitForStore` → `{ stored: true }`), `/v1/flush`, client `flush`, server `flushBalanceWorkerCustomer`. `requestContextToCommandBase` fills `requestId` / `occurredAt` for a context without them, so cron evicts stop being rejected. | worker integration: a log-durable track, then evict, then a read shows the deduction (red today); `flush` returns only once the row is in Postgres. Worker unit suite green. |
| 2 | **A plan evicts only when it bypassed.** `writePlanRows` returns `bypassedWorker: boolean` (refused lane, stale fallback, license or pool rows written by `writePostgresOnlyRows`); `applyPlanRebalances` returns whether it moved a balance; `executeAutumnBillingPlan` evicts once, after step 3, when either is true. The bypasses beside the plan evict themselves: `publishBillingTransition` after `persistPublishedBalanceTransitions` (`preserveSubjectCache` no longer implies "no worker evict"), `insertPendingCustomerProducts` / `promotePendingCustomerProducts`, `getOrCreateStripeCustomer` after writing `processor`. `refreshCacheConfigs` gains `balanceWorker: "evict" \| "routed"` (default `"evict"`); the middleware's worker evict follows it; billing routes go `"routed"`; `/entities.update`, `/billing.multi_update`, `/billing.restore` join the list. `reconcileLicenseStateForCustomer`'s own `deleteCache` stays. | integration on the worker path: attach a free plan then track — the worker's revision continues (no re-hydration); attach a plan with a license pool → the next read sees the pool (evicted); a refused plan (license seat) → next read fresh; auto top-up then check → the topped-up balance (red today); upgrade with carry-over then check → the carried balance (red today: preserved cache). `billing/attach` smoke. |
| 3 | **Done 2026-09-24** (`setupFullCustomerContext` flushes before `getFull`, always, best effort). **Billing reads what the worker wrote.** `setupFullCustomerContext` calls `flushBalanceWorkerCustomer` before `getFull` when the customer is routed. | integration: track 30 on a usage price, attach an upgrade in the same millisecond → the invoice's usage line carries 30 (red today when the committer lags). |
| 4 | **Core routes stop evicting.** `customers.create`, `POST /customers`, `get_or_create`, `entities.create`, `POST /customers/:id/entities` go `"routed"`. The entity route's legacy branches (claims, paid seats that fall to the Postgres lane, delete) already end in the executor or the chokepoint, which evict themselves. | integration: entities.create then track — revision continues; entity delete then check — fresh. |
| 5 | **Done 2026-09-24** (plus: no invalidation is gated on the rollout flag, and the client starts regardless). **Batch writers evict through the queue.** `queue.evict` door + command-consumer `case "evict"`; `queueBalanceWorkerEvicts` on the server; `batchInvalidateCachedFullSubjects` and `invalidateResetCaches` (and the v1 cron's `invalidateCustomerEntitlementBalance`) call it for routed customers. | integration: batch migration on the worker path, then track → the migrated allowance; SQL-lane reset (rollout off for the sweep, on for the request) then check → refilled. |
| 6 | **Routing per org; the handoff on a crossed bucket.** `isBalanceWorkerRolloutEnabled({ orgId, env, customerId })` from the rollout edge config; `runResetLoopV2` chooses the lane per row; `rolloutMiddleware`-style snapshot detects a crossed bucket since `changedAt` → forward: `invalidateCachedFullSubject({ flushBalances: true })` before the first worker command; back: flush + evict before the first Redis read. Owned by `plans/balance-worker-rollout/` (2026-09-25). | integration mirroring `rollout-track-transition`: Redis → worker → Redis with tracks at each stage, balance exact throughout. |
| 7 | **One invalidation verb.** `deleteCachedFullCustomer` stays the public name (the cloud repo calls it everywhere); `invalidateCachedFullSubject` goes back to Redis-only, internal to `customers/cache/fullSubject/`, and its ~8 in-repo callers outside that folder move to `deleteCachedFullCustomer`. Deferred until this branch merges. Then: **retire the chokepoint's evict.** When the last legacy direct writer of worker-held rows is a plan facet (`plans/balance-worker-apply-plan/`, `~32 CusService.update` sites, entity delete), `invalidateCachedFullSubject` drops `evictBalanceWorkerCustomer` and is Redis-only. Tracked here, scheduled there. | the server unit suite with no evict from the chokepoint |

Order: 1 → 2 → 3 are one stack (the worker primitive, then the two billing consumers). 4 and 5 are
independent of each other after 2. 6 last; it needs 1 and 5.

## Folder structure, units 1–5

```
packages/balance-engine/src/commands/flush/types/flushCommand.ts     new
packages/balance-worker-client/src/{commands/sendFlush,contracts/flush}.ts   new
packages/balance-worker-client/src/queue/                            evict door
apps/balance-worker/src/processor/commands/flush.ts                  new
apps/balance-worker/src/processor/writer/actions/evict.ts            + waitForStore
apps/balance-worker/src/http/handlers/receiveFlush.ts                new
apps/balance-worker/src/kafka/commandConsumer/createCommandRecordHandler.ts   case "evict"

server/src/internal/balances/balanceWorker/
├── evictBalanceWorkerCustomer.ts          unchanged
├── flushBalanceWorkerCustomer.ts          new
└── queueBalanceWorkerEvicts.ts            new
server/src/internal/billing/v2/setup/setupFullCustomerContext.ts     flush before getFull
server/src/internal/billing/v2/execute/executeAutumnBillingPlan/
├── executeAutumnBillingPlan.ts            evict when bypassed
└── writePlanRows/writePlanRows.ts         bypassedWorker on the result
server/src/honoMiddlewares/refreshCacheConfigs.ts                    balanceWorker policy per route
server/src/honoMiddlewares/refreshCacheMiddleware.ts                 Redis always; worker per policy
```
