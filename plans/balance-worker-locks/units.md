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

Before any of it ships: the evict todo in `plans/balance-worker-concurrent-writers.md`, and a decision on usage events for the worker path.

## Unit 1, slices

1. The table: drizzle model and migration for `balance_locks`.
2. Engine state: the lock row model, open locks on `SubjectState`, split and merge, the `locks` row change (insert and delete only).
3. Hydration and commit: locks in the customer load query, `balance_locks` writable by the committer.
4. The lock decision: `lock` on the track command, duplicate guard, the row insert in the same mutation.
5. Server: stop refusing `lock`, build the lock onto the command, map `lock_already_exists`.
