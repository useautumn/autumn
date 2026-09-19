# Balance worker: routing and cut-over

2026-09-18 · stub, deferred from `plans/balance-worker-postgres-commit.md` · not started

## Today

- `isBalanceWorkerRolloutEnabled` = `BALANCE_WORKER_ROLLOUT_ENABLED && env === sandbox`; the env
  flag refuses `true` outside `NODE_ENV=development`. One global switch, no per-org, no procedure.
- Shadow routing is an edge config keyed by org, env, customer, feature (`balanceShadowEdgeConfig.ts`).

## Why Postgres commit makes this possible

With SQLite the worker's deductions never reached Postgres, so cutting a customer back lost them.
With Postgres commit both paths share the truth; the switch is an ordering problem.

```
forward   Redis path → worker
  1 flip routing for (org, env)                 new tracks go to the worker
  2 flush Redis balances to PG, invalidate      invalidateSharedBalanceFields: GETDEL + flush
  3 worker hydrates from PG on first command
  race: a Redis track in flight during 1..2 syncs after the worker hydrated →
        the worker's CAS 409s its next commit → evict → rehydrate

back      worker → Redis path
  1 flip routing                                new tracks go to Redis
  2 worker drains pending commits for the org   every acked track is already in PG
  3 delete the cached FullSubject               Redis re-hydrates from PG
  race: a worker track in flight during 1..2 commits after Redis hydrated →
        Redis stale by one track until the next invalidation
```

## Expected design

- Routing becomes an edge config keyed by org and env, the shape shadow already uses. Org+env is
  the unit: a per-customer percentage splits one org across both write paths, which is what makes
  step 2 racy.
- A `balance-routing` CLI runs the forward and back steps for an org and verifies with a check.

## Open questions

- Does the flip need a short "drain" state where both paths refuse writes for the org?
- Which of the server's structural writers must be aware of routing before cut-over (see
  `plans/balance-worker-concurrent-writers.md`)?
