# listObjects — regression gates for the list queries

Two read-only scripts that verify the changes in this PR against production data.
They exist because both touch shared query paths and the integration suite can't
currently run (every test fails with `password authentication failed for user
'neondb_owner'`, reproducible on a clean tree).

Both build queries directly rather than calling `CusBatchService.getPage()` or
`getFullSubject()`, which would fire lazy resets, migration checks and
batch-reset enqueues.

```sh
infisical run --env=prod --recursive -- bun run server/experiments/listObjects/<script>.ts
```

| script | what it gates |
|---|---|
| `verifyCustomerCrawl.ts` | `customers.list` — walks N pages with OFFSET and with the keyset memo, asserting the same customers in the same order, plus the Redis memo round-trip and filter-key isolation |
| `verifyPlanFilterCount.ts` | `countFilteredEntitiesByOrgIdAndEnv` across filter combinations |
| `benchPlanFilterPage.ts` | the plan-filtered `entities.list` page query — 176s / 197.6M buffers before the `plan_scopes` join, 0.43s / 473k after |

Correctness of the plan filter is covered by
`server/tests/integration/crud/entities/list-entities-plan-filter.test.ts`;
these scripts only measure cost against production-scale data.

Env: `ORG_ID`, `ENV`, `LIMIT`, `PAGES`, `OFFSET`, `SEARCH`, `PLAN`, `CUSTOMER_ID`.
`out/` is gitignored.

## Two traps these encode

**Compare on a snapshot.** Busy orgs mutate continuously, and under
`ORDER BY created_at DESC` new rows sort first and shift every offset. A crawl
taking 35s will diff against itself for no reason. Both sides run inside one
`repeatable read, read only` transaction.

**Compare on `internal_id`, not `id`.** `customers.id` is nullable (375 rows in
prod). Collapsing nulls into a `Set` reports them as duplicates and can hide a
real skip behind that number.

## Worth knowing when picking this up

`customers.list` on API 2.2.0 is the only path that writes memos; 2.3.0 orgs go
through `getCursorPage` and never touch it. The keyset predicate excludes rows
with a null `id`, but only when a page boundary lands inside their exact
`created_at` tie group — same semantics as the existing 2.3.0 cursor path. A
full crawl of `athenahq` (the org with the most null ids, 47) returns all 4,876
customers with no skips.
