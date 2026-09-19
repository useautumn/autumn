# Balance worker: concurrent Postgres writers

2026-09-18 · deferred from `plans/balance-worker-postgres-commit.md` · not started

Once the worker commits to Postgres, it shares those rows with every other writer. This file
holds what we know and the design we expect to land later. The commit plan only ships the
backstop (a compare-and-set that turns a conflict into a retryable 409 and an eviction).

## Who writes the rows the worker owns

| writer | file | columns |
|---|---|---|
| reset cron | `server/src/cron/resetCron/resetCustomerEntitlement.ts:198` | balance, next_reset_at, adjustment; inserts rollovers |
| short-duration reset | `server/src/cron/resetCron/resetShortDurationCustomerEntitlement.ts:25` | same |
| batch reset | `server/src/internal/balances/batchReset/execute/executeResetMutations.ts:36` | balance, additional_balance, adjustment, entities, usage_attribution, next_reset_at (guarded by next_reset_at) |
| billing v2 attach | `server/src/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts.ts:63` | inserts customer_products, customer_entitlements, rollovers |
| billing v2 updates / transitions | `updateCustomerEntitlements.ts:41`, `batchTransition/execute/sql/*` | balances, cache_version |
| pooled balances | `pooledBalances/execute/executePooledBalancePlan.ts:80` | pooled cusEnt balances |
| update-balance API | `updateRemainingV2.ts:80`, `updateUsageV2.ts:124`, `updateIncludedGrantV2.ts`, `updateNextResetAtV2.ts`, `updateExpiresAtV2.ts` | direct cusEnt writes |
| invoice.created | `processPrepaidPricesForInvoiceCreated.ts:125` and siblings | rollover inserts |
| usage windows | `usageWindowRepo.setWindows` from updateCustomer / updateEntity; `lazyResetSubjectUsageWindows.ts:55` | usage_windows rows |
| entities | `batchCreateEntities.ts:92`, `deleteEntity.ts:118` | entity rows, `ce.entities` |
| Redis sync-back | `syncItemV4.ts` → `syncBalancesV2.sql` | balance, adjustment, entities, usage_attribution; rollovers; usage_windows. Idle for routed customers. |

## The precedent

The Redis path is a cache in front of the same rows and solves the same problem twice:
- guarded write: `sync_balances_v2` raises `RESET_AT_MISMATCH` / `ENTITY_COUNT_MISMATCH` /
  `CACHE_VERSION_MISMATCH`, and on conflict drops the sync and deletes the cached full customer;
- pushed invalidation: `deleteCachedFullCustomer`, `invalidateSharedBalanceFields`, `clearOrgCache`
  are called from every structural writer.

## Expected design

```
server structural write ──► notifyBalanceWorkerOfSubjectChange({ identity })
                            POST /v1/subjects/invalidate to the owner (client already routes)
worker                      settle pending mutations for the subject, evict its cache entry
next command                re-hydrates from Postgres
missed signal               CAS fails → 409 stale_subject, evict, progress advances, keep draining
```

- Sibling of catalog invalidation (`plans/balance-worker-customer-state.md` unit 12).
- Long term the structural writers become worker commands (attach, reset, adjust), and the
  worker is the only writer of the columns it owns for routed customers.

## Open questions

- Which server sites are the complete set? Start from the `deleteCachedFullCustomer` callers.
- Does a reset that lands mid-cycle need the worker to re-decide or only to re-read?
- Entity create/delete changes `ce.entities` on a customer-level row the worker may hold.
