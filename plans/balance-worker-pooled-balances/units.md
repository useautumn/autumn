# Units of work

| # | unit | ends with this passing | status |
|---|---|---|---|
| 1 | **Hydration loads the pool.** `subjectRowsSql` gains `pooled_entitlements` (the pool cusEnt, joined to a live `pooled_balances` row, customer subject only; sources and license pools stay out) and a `pooled_balances` array; `PooledBalanceSchema` in shared types the envelope; `workerCustomerEntitlement` picks `is_pooled_balance` / `pooled_balance_id`; `SubjectState.pooledBalances` (customer state only; merge concatenates); `subjectStateToFullSubject` joins `pooled_balance` and builds `pooled_customer_entitlements`; `deltasToUsageEventFields` and the lock unwind enumerate the bucket. Shared view `pooled_balance` narrowed to the grant (`PooledBalanceGrantView`). | `subjectRowsSql.test.ts` pooled cases · engine `pooledBalances.test.ts` 5/5 · worker `check-pooled-balances` 1/1, `track-pooled-balances` 3/3 · `pooled-balance-usage-alert` 2/2 (herald, unchanged) | done 2026-09-22 |
| 2 | **Rollovers and lifecycle on the pool row.** Pool rollovers ride hydration already (`cus_rollovers` keys off `all_entitlements`); prove the rest: `track-pooled-rollovers`, `track-pooled-mixed-lifecycle`, spend-limit and usage-window pooled files on the worker path. | those files | |
| 3 | **Grant changes reach the worker.** Every writer of `pooled_balances.granted` (attach, update, reset, cron, contribution changes) evicts the customer; `validateMeteringEntitlement`'s `pooled_balance_not_supported` refusal on the initialize path goes. | `billing/pooled-balances/*` files that track after a change | |
| 4 | Herald parity for pooled alerts. | `pooled-balance-usage-alert` 2/2 | done with unit 1 |

## Decided

1. The pool is a state row like any other; `pooled_balances` is a small read-only state table joined
   at `subjectStateToFullSubject`, the way rollovers are. The worker never writes it.
2. The pool lives in the customer's state only. An entity command reads it through the merge, so the
   entity's own hydration leaves it out (it double-counted otherwise).
3. Sources (`pooled_contribution_id` set) are never loaded: they hold no balance and the legacy
   selection drops them too.
4. License pools (`pooled_balances.customer_license_link_id`) are excluded with the rest of licenses.
