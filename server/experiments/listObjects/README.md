# listObjects — cost checks for the entity list queries

Read-only scripts that measure the plan-filtered `entities.list` queries against
production-scale data. Correctness is covered by the integration tests
(`server/tests/integration/crud/entities/list-entities-plan-filter.test.ts` and
`…-cursor-plan-filter.test.ts`); these only measure cost.

They build queries directly rather than calling the handlers, which would fire
lazy resets, migration checks and batch-reset enqueues.

```sh
ORG_ID=<org> ENV=<live|sandbox> \
  infisical run --env=prod --recursive -- bun run server/experiments/listObjects/<script>.ts
```

`ORG_ID` and `ENV` are required — the scripts refuse to run without them rather
than defaulting to a real production org.

| script | measures |
|---|---|
| `benchPlanFilterPage.ts` | offset page query — 176s / 197.6M buffers before the `plan_scopes` join, 0.43s / 473k after |
| `benchPlanFilterCursor.ts` | cursor page query — 26.7s / 63.2M buffers before, 0.40s / 473k after |
| `verifyPlanFilterCount.ts` | `countFilteredEntitiesByOrgIdAndEnv` across filter combinations — 150s → 0.33s |

## Why the EXISTS was slow

The plan filter was a correlated `EXISTS`, so Postgres probed
`customer_products` once per candidate entity. On the count there is no `LIMIT`
to stop it at all; on the page queries the `LIMIT` can't push through a per-row
subquery, and with a rare plan (~0.5% of entities match `enterprise`) the scan
walks a long way before it fills. `buildPlanScopeCte` resolves the matching
`(customer, entity-scope)` pairs once from the plan side instead.
