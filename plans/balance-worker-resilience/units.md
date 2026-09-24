# Units of work

Ordered; each ends in a passing test and stops for review. Unit 1 is the predicate the other
three key on. Unit 2 before 3 because the deducting check reuses the track fallback.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **Every temporary worker failure is a 503.** `external/balanceWorker/isTransientBalanceWorkerError.ts` beside `isTransientRedisError`: `UNAVAILABLE_CLIENT_CODES`, worker `NOT_READY` / `INTERNAL` / `INVALID_RESPONSE`, non-deadline Kafka producer errors. `balanceWorkerErrors.ts` maps every member to 503 with `Retry-After: 1`: `result_unknown` when the outcome is unknown (`INTERNAL`, `INVALID_RESPONSE`, deadline after send), else `balance_worker_unavailable` (`NOT_READY`, no owner). `CATALOG_NOT_FOUND` stays a real error. Worker: a transient Postgres error during hydration answers `NOT_READY`, not `INTERNAL`. | server unit `balanceWorkerErrors.test.ts`: each code → status + body code; worker unit `createWorkerErrorHandler.test.ts`: hydration transient → 503. Integration: worker stopped → track/check/get_or_create all 503, none 500. |
| 2 | **A failed sync track is queued, 202.** `withRedisFailOpen` → `withFailOpen({ isTransient, run, fallback })`, the Redis wrapper = that + the readiness probe. `runBalanceWorkerTrack` runs each feature's HTTP command under it with the worker predicate; the fallback is `queue.track` of the **same command** (same `commandId`, no `idempotency` on the command: the server's claim from dedup unit 4 is kept, as async does), sets `trackQueuedForReplay`, and the handler answers 202 with `getQueuedTrackResponse`. `orgRateLimitDegraded` takes the queue directly. A failed append → 503 and the key is released. A queued duplicate is refused and dropped by the consumer (already true). | integration on the worker path, `balances/track/queue-fallback`: worker HTTP down → 202 `balance: null` → worker up → balance moved once; worker killed after decide (unknown outcome) → 202 → consumer refuses `DUPLICATE_COMMAND`, balance moved once; append also failing → 503, key released (a retry with the key is accepted). Unit: `handle-track-queue-fallback` gains the worker lane. |
| 3 | **Check fails open, 202.** `runBalanceWorkerCheck` under `withFailOpen` with the worker predicate → `getCheckFailOpenFallback` (`allowed: true`), 202 from `handleCheck` as today when `checkData` is null. `orgRateLimitDegraded` fails open. A deducting check (`send_event`, lock) reuses unit 2: the deduction is queued, the answer is the fallback. The legacy 3s route timeout stays skipped (the client deadline is 1s). | integration `balances/check/check-fallback` on the worker path: worker down → 202 `allowed: true`; `send_event` check with the worker down → 202 → worker up → deduction landed once. |
| 4 | **Creates shed and recover.** The worker branch of `getOrCreateApiCustomerByRollout` runs under `shed503OnTransientError`, which gains the worker predicate beside the Postgres and Redis ones (the create's Postgres remainder and Stripe steps still throw those). `onTransientError` enqueues `queueFailedCustomerCreation` with the same payload; `setCustomerCreationRecoveryStage` is set on the worker create path (`lookup` → `pre_commit` → `autumn_committed` → `completed`) so the "manual billing review" rule holds. The replay reruns get_or_create, which routes to the worker; an `unknown` outcome whose create landed replays as `fetched`. The 429 org-cap enqueue already applies. | unit `get-or-create-recovery-capture` on the worker lane: worker `DEADLINE` → 503 + one enqueued payload with the stage. Integration `crud/customers/get-or-create-recovery`: worker down → 503 → replay consumer on → customer exists, one row; create landed but unknown → replay is `fetched`. |
| 5 | **Optional: `entities.create` recovers.** `createEntitiesV2` on the worker lane enqueues the same recovery payload with `entity_id` / `entity_data` on a transient failure after Stripe ran; the replay's `withCreateIfMissing` creates the entity. Or reorder Stripe after the Autumn write and skip the queue; decide after unit 4. | integration: worker down after the Stripe step → 503 → replay → entity exists, Stripe charged once. |

## Folder structure

```
server/src/
├── external/balanceWorker/
│   └── isTransientBalanceWorkerError.ts        new (unit 1)
├── external/redis/utils/
│   ├── withFailOpen.ts                          new: the generic wrapper (unit 2)
│   └── withRedisFailOpen.ts                     = withFailOpen + readiness probe
├── db/shed503OnTransientError.ts                + worker predicate (unit 4)
├── internal/balances/balanceWorker/
│   └── balanceWorkerErrors.ts                   full mapping (unit 1)
├── internal/balances/track/balanceWorker/
│   ├── runBalanceWorkerTrack.ts                 withFailOpen → queue fallback (unit 2)
│   └── queueBalanceWorkerTrackFallback.ts       new: same command → queue.track, flags (unit 2)
├── internal/balances/check/balanceWorker/
│   └── runBalanceWorkerCheck.ts                 withFailOpen → fallback (unit 3)
└── internal/customers/actions/
    └── getOrCreateApiCustomerByRollout.ts       worker branch under the shed (unit 4)

apps/balance-worker/src/http/handlers/errorHandler/
└── createWorkerErrorHandler.ts                  hydration transient → NOT_READY (unit 1)
```

## Case matrix (written before each unit's tests)

| lane | failure | legacy answer | worker answer after this plan |
|---|---|---|---|
| track | owner unreachable / deadline before send | 202 queued | 202, same command queued, key kept |
| track | deadline after send (unknown) | 202 queued (Lua dedup) | 202, same command queued, worker dedups |
| track | worker `NOT_READY` (capacity) | n/a | 202 queued |
| track | queue append fails too | 5xx | 503, key released |
| track | org rate cap degraded | 202 queued | 202 queued |
| track | `STALE_SUBJECT` | n/a | 409, key kept (unchanged) |
| check | any of the above | 202 `allowed: true` | 202 `allowed: true` |
| check `send_event` | any of the above | 202, deduction dropped | 202, deduction queued |
| get_or_create | read or create unreachable | 503 + recovery enqueue | 503 + recovery enqueue |
| get_or_create | create landed, outcome unknown | n/a | 503 + enqueue; replay `fetched` |
| get_or_create | `customer_exists` / stale create | n/a | 200 with the existing customer (unchanged) |
| entities.create | transient after Stripe | 500 (no shed) | 503 (unit 1); recovery optional (unit 5) |
