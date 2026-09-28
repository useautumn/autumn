# Units of work

One stacked branch each, off the balance-worker branch. Each unit is a thin
vertical slice that ends in a runnable integration test.

| # | unit | files | ends with this passing |
|---|---|---|---|
| 1 | **Subscription cache, end to end.** `packages/cache/src/subscriptions/subscriptionCache.ts` (+ `types/`), exported from `cache.ts`; server `external/redis/miscCache/getMiscCacheContext.ts` (memoized `{ miscCache, logger }`); `SubService` imports the package action and drops keys after `createSub`, `createSubIfAbsent`, `update`, `updateFromStripe`, `upsertByStripeId` (delete the two dead methods and `addProductFromSubs`); `internal/subscriptions/actions/readCachedSubscriptions.ts`; `readBalanceWorkerSubject` calls it. Key pinned in `misc-redis-keys.test.ts`. | ~7 | package unit tests (miss → set, hit, invalidate hits every target, Redis down falls open); `subscriptions-cache.test.ts` integration: attach → get → key present; anchor reset via `customer.subscription.updated` → key gone, next get shows the new period. |
| 2a | **Invoice writes through one door.** `InvoiceService.upsertMany` (from `insertInvoices`), `addRefundedAmount` (from `invoiceRefundUtils`), `update` for the Vercel refund, `deleteByStripeId` (from the rollback). No behaviour change. | ~5 | existing `invoices-insert`, `cancel-immediately-refund`, `vercel-invoice-refund` cases green; `rg "(insert|update|delete)\(invoices\)" server/src` hits only `InvoiceService.ts`. |
| 2b | **Invoice cache, end to end.** `packages/cache/src/invoices/customerInvoicesCache.ts`; `InvoiceService` imports the package action and drops `invoices:{internal_customer_id}` after every write (both owners for `upsertMany`); `internal/invoices/actions/readCachedCustomerInvoices.ts`; `readBalanceWorkerSubject` calls it and skips invoices for entity subjects. Key pinned. | ~7 | package unit tests; `invoices-cache.test.ts` integration: attach → get → key present; `invoices.pay` → key gone, next get shows `paid`; invoice voided in Stripe → `invoice.updated` → next get shows `void`; refund route → next get carries the new `refunded_amount` in the row. |

Ordering: subscriptions first because every write is already in `SubService`,
so the first end-to-end review is the cheapest. 2a is its own PR so the
consolidation is reviewable without cache noise.

Out of scope, noted for later: caching `getApiEntityExpand`'s entity invoice
read; negative caching of missing subscription rows; a per-customer epoch if
the miss-then-stale-set race is ever observed.
