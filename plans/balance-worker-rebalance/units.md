# Units

1. ✓ **Engine `rebalance` + shared helpers + parity test.**
2. ✓ **Auto top-up through the worker.** Purchase fields, `rebalancesToPlanOps`,
   routing, `rebalancesApplied`, eviction removed. `auto-topup-rebalance`
   asserts per plan.
3. ✓ **Threshold settle + manual top-up.** Purchase fields; merge keeps one
   top-up's purchase. `manual-top-up` 3 asserts per cusEnt.
4. ✓ **One-off purchases.** Worker ops; Postgres lane sizes each purchase
   after the previous (D2).
5. ✓ **Expiring grants (D1).** Grant inserted at 0 on the worker, credited live.
6. **Remove** the Postgres lane's `applyPlanRebalances` and
   `rebalancesApplied` with the Postgres write path; the deltas field with it.

## Follow-ups

- ~~`getBillableFullCustomer` reads the worker~~ Done (fails open to Postgres).
- An entity-level purchased row the plan doesn't name falls back via
  `StaleMutationError` (the worker drops its copy). Rare; unguarded.
