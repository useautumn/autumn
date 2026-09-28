# Units of work

Thin vertical slices, each ending in a runnable integration test.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **A lock exists.** `balance_locks` table. Open lock ids in the customer's state, loaded with the customer. The lock decision: duplicate id -> error, else deduct and insert the row, one mutation. Server sends `lock` through the worker on check and track. | `check-with-lock-errors.test.ts` duplicate cases, plus a lock visibly deducting |
| 2 | **Finalize.** The `finalize` command, the server's routing read, split + unwind + forward for a plain metered feature. | `check-with-lock-release`, `-refund`, `-additional-deduct`, `-refund-breakdown` |
| 3 | **Every bucket shape.** Entities, rollovers, fixed-rate credit systems, a bucket that vanished after an upgrade, overage behaviours. | `entities/*`, `-rollovers`, `-credit-system`, `-edge-cases`, `-overage-behavior` |
| 4 | **Expiry.** EventBridge passthrough (fakecloud locally) and the sweep loop. | `check-with-lock-expiry`, `-race` |
| 5 | **Windows and overdue.** Usage windows shrink on refund, overdue block on confirm. | `usage-window-lock`, `check-overdue-entitlements` lock cases |
| 6 | **Graduated credits.** Marginal-tail repricing. | `track-graduated-credit-system` lock cases |

## Status

| unit | state |
|---|---|
| 1 | done, committed. `check-with-lock-errors` passes. |
| 3 | done. With the events assertion stubbed locally (not committed), all of these pass: `entities/check-lock-per-entity`, `entities/check-lock-entity-product`, `-rollovers`, `-credit-system` (12 tests), `-edge-cases`, `-overage-behavior`, `-properties`, `-unlimited`, `-no-entitlement`. Two fixes came out of it, both in when a locked check tracks: a `cap` or `overflow` lock tracks even when the reject-mode pre-check says no, and a requirement of 0 is met with nothing attached. |
| 4 | partly done. A lock's row carries `expires_at` and `expiry_action`. A caller-set expiry releases through its EventBridge timer and the `expireLock` job, as before. The 24 hour default confirms through the sweep loop, which sends the worker a `confirmExpiredLock` command per due lock: the worker deletes the row and the id it holds in one mutation, so the server never writes `balance_locks`. `lock-sweep-confirm` passes. Open: the sweep skips release locks, so one whose EventBridge timer never fires stays open; fakecloud in `bun dw` (probed: it delivers only to its own SQS, so it replaces ElasticMQ); `check-with-lock-expiry` 1 needs it, 4 and 5 read the Redis receipt TTL. |
| 5 | done. A give-back frees the usage window it counted, and a confirm above the lock is held to the headroom and the overdue block. `check-overdue-entitlements` passes, `usage-window-lock` 1 to 3 pass. `usage-window-lock4` expects a clamp where a `reject` lock refuses, on the legacy path too. |
| 6 | done. A graduated rate gives back its current marginal tail. Both `track-graduated-credit-system` lock cases pass. |
| 2 | done. 32 of 32 finalizes answer 200 and no lock is left open. Its four target files stop only at `expectCustomerEventsCorrect`; every balance assertion before it passes. |

**Usage events come after all of lock and finalize is done** (decided 2026-09-21). Until then, judge a lock test by its balance assertions: a failure at `expectCustomerEventsCorrect` is expected, a failure anywhere else is real.

Before any of it ships: a decision on usage events for the worker path. The evict todo is done.

A lock conflict or a deleted customer is a rejection of that one record, never a partition recovery. The SQS workers, the cron process and the integration test process all start the ownership consumer, so their calls reach the worker; trigger.dev runners do not yet.

Passing end to end: `check-with-lock-race`, `check-with-lock-concurrent-stress`, `finalize-lock-queued-replay`, `lock-sweep-confirm`. The stress test found that a flush of more than 100 row changes failed in Postgres (`json_build_array` takes at most 100 arguments) and fell back to one transaction per record; fixed in `flushSql`, and the committer now warns whenever a flush lands piece by piece.

An evict that arrives while a customer is still loading marks that load as overtaken; the load reads again before anything becomes resident (`inFlightLoads`).

## Unit 1, slices

1. The table: drizzle model and migration for `balance_locks`.
2. Engine state: the lock row model, open locks on `SubjectState`, split and merge, the `locks` row change (insert and delete only).
3. Hydration and commit: locks in the customer load query, `balance_locks` writable by the committer.
4. The lock decision: `lock` on the track command, duplicate guard, the row insert in the same mutation.
5. Server: stop refusing `lock`, build the lock onto the command, map `lock_already_exists`.
