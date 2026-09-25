# Units

Each unit is a thin end-to-end slice: engine → worker → client → server gate,
green on the named integration suites with the worker flag on.
Suites live under `server/tests/integration/balances/update/`.

1. ✓ **Skeleton + `remaining`.** The whole pipe for one field.
   - Engine: `updateBalanceCommand` type, `selectUpdateBalanceRows` (feature
     rows + filters, 404), invoice-credit guard, `setBalance` for a target only,
     deduction `+ filters, + rowSelection, + "allow"`.
   - Worker `processor/commands/updateBalance.ts`, client `updateBalance`.
   - Server `runUpdateBalance` gate, `runBalanceWorkerUpdateBalance`,
     `updateBalanceParamsToCommand`, `skipCacheDeletion` (D6).
   - Spec: `update-balance-basic`, `-with-filters`, `-with-id`,
     `update-balance-no-match`, `invoice-credit-mutation-guards` (remaining).
2. ✓ **Rest of `setBalance`.** `addToBalance`, `usage`, unlimited-first,
   entities; `/usage` routed through `runUpdateBalance`.
   - Spec: `update-balance-breakdown`, `-per-entity`, `-entity-product`,
     `-allocated`, `update-usage-basic`, `-adjustment`, `-filters`, `-entity`,
     `allocated/update-usage-free-allocated`, `-prepaid`, `-allocated-v2`,
     `usage-windows/set-usage-does-not-bypass-usage-window`.
3. ✓ **`setIncludedGrant`.** Row and entity-entry adjustment.
   - Spec: `update-included-basic`, `update-balance-prepaid-granted`.
4. ✓ **`setNextResetAt` + `setExpiresAt`.** Plus all-or-nothing (D2).
   - Spec: `update-next-reset-at`, `update-expires-at`,
     `update-balance-combined`.
5. ✓ **Fallback, async, races.** `withPaidAllocatedFallback` around the worker
   call; async consumer through the gate; concurrent track.
   - Spec: `allocated/update-usage-paid-allocated`, `update-balance-async`,
     `update-usage-concurrent`, `legacy/legacy-update-balance`.
   - Then one sweep of `balances/update` with the flag on and off.

## Known failures, not caused by this work

- API < 2.4 entity aggregation (parity item 9, skipped): `update-balance-with-filters` filters3,
  `update-balance-entity-product` 1–2, `update-usage-entity` 3–4 read a customer total that
  includes entity plans.
- `legacy-set-usage2` (paid allocated via `/usage`, step 3): 6 invoice items for 5; fails the
  same with the worker branch off.

## Decisions made while landing

- `/usage` gates in its handler: legacy `/usage` creates a missing customer, so the worker path
  runs inside `withCreateIfMissing`; `balances.update` does not create.
- A negative `add_to_balance` counts toward usage windows but is not capped by them (overflow);
  the Lua caps it. An admin top-down landing short silently was judged worse.
- `usage` with `add_to_balance`: the usage target wins (legacy applies both; the end balance matches).
- Layout stays in `v2/`: `updateBalanceV2` (async split) → `runUpdateBalanceV2` (the sync gate) →
  worker lane or `updateBalanceOnCacheV2` (the legacy body, also the paid allocated fallback lane).
- Async on the worker path is a queued command on the Kafka command log (`queue.updateBalance`,
  consumed by `consumeUpdateBalance`), as async track is. SQS stays the legacy queue; its consumer
  runs `runUpdateBalanceV2`, so jobs queued before the flag flips still drain.
- Queued paid allocated v1 is refused at the consumer and dropped (logged), as queued track is.

## Unit 1 cases

Engine unit (`computeUpdateBalance`):

| # | Subject | Command | Expect |
|---|---|---|---|
| E1 | one row, balance 100 | remaining 40 | row −60 |
| E2 | one row, balance 100 | remaining 150 | row +60 (no refund ceiling) |
| E3 | one row, balance 10 | remaining −20 | row −30 (no floor under "allow") |
| E4 | rows A (starter), B (topup) | remaining X, balanceId starter | only A moves |
| E5 | rows A, B | customerEntitlementId B | only B moves |
| E6 | rows monthly, lifetime | interval month | only monthly moves |
| E7 | row for another feature only | remaining 40 | 404 CustomerEntitlementNotFound |
| E8 | filters match nothing | balanceId typo | 404, no changes |
| E9 | invoice-credit row | remaining 40 | refused InvalidRequest |
| E10 | credit system funding the feature | remaining 40 | only the feature's own rows are summed and drawn |
| E11 | a row with a rollover | remaining lower | rollover drawn first; Σ excludes it |
| E12 | any | remaining 40 | usage windows untouched, no effects |

Integration: the four spec suites above, unmodified, flag on. Plus one
assertion per suite run that the server log shows the worker path, not
`executeRedisDeductionV2`.
