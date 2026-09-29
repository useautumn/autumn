---
author: john + claude
feature: subscription-invoice-cache
date: 2026-09-28
status: draft, not yet approved
---

# Subscription and invoice rows cached in `@autumn/cache`

On the worker path, `customers.get` renders balances from the worker and then
runs two Postgres reads the worker never holds: the subscription rows and the
customer's last ten invoices (`readBalanceWorkerSubject.ts:69-75`). This puts
those two reads behind the misc cache, with the invalidation living in the one
place each table is written.

## What a customers.get reads today (worker path)

```
customers.get?expand=invoices
  │
  ├─ worker.readSubjectState ──► customerProducts[].subscription_ids
  │                                        │
  ├─ SubService.getInStripeIds ◄───────────┘
  │     readBalanceWorkerSubject.ts:22
  │     SELECT * FROM subscriptions WHERE stripe_id IN (...)
  │
  └─ InvoiceService.list      (only when expand has "invoices")
        readBalanceWorkerSubject.ts:33
        SELECT i.*, resolved_product_ids FROM invoices
        WHERE internal_customer_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 10
```

What the response actually uses from each row:

- subscription: `current_period_start`, `current_period_end`, matched by
  `stripe_id` (`getApiSubscriptionV2.ts:71-92`). Nothing else.
- invoice: `id`, `stripe_id`, `status`, `total`, `currency`, `created_at`,
  `processor_type`, and `plan_ids` from `resolved_product_ids ?? product_ids`
  (`InvoiceService.ts:30-73`).

Two catches attached to that:

- `entities.get` never renders `fullSubject.invoices` (`getApiEntityBaseV2.ts:73`).
  Its invoices come from a separate uncached read in `getApiEntityExpand.ts:11-49`
  (limit 100, entity filter, plus a whole `CusService.getFull`). The worker
  path's invoice read is wasted work for entity subjects.
- `resolved_product_ids` is computed at read time from `products.id`
  (`resolvedProductIdsSql.ts:7-40`). A plan rename changes it without touching
  the invoice row. The legacy FullSubject blob already caches it for three days,
  so this staleness is accepted today.

## Who writes the two tables

Every subscription write already goes through `SubService`; `subscriptions` is
imported nowhere else. Two of its methods are dead (`deleteFromScheduleId`,
`updateFromScheduleId`, no callers) and `addProductFromSubs` is dead too.

```
subscriptions                              who calls it
──────────────────────────────────────────────────────────────────────
SubService.upsertByStripeId   runPlanSideEffects.ts:34 (billing plans)
                              upsertSubscriptionFromBilling.ts:14
                                (every Stripe sub action, sub.created)
SubService.updateFromStripe   syncAutumnSubscription.ts:30 (sub.updated)
                              updateStripeSub2.ts:109 (legacy upgrade)
SubService.createSubIfAbsent  createStripeSub2.ts:163
                              handleCheckoutSub.ts:46
SubService.createSub          addProductFromSubs.ts:150 (dead)
```

Invoices have seven low-level writers. Three are in `InvoiceService`; four
bypass it with their own drizzle statement:

```
invoices                                  writer
──────────────────────────────────────────────────────────────────────
InvoiceService.upsert / update / createInvoiceFromStripe
  ← upsertFromStripe, updateFromStripe, upsertDbAndCache,
    invoiceUtils, upsertInvoiceFromBilling,
    recordRevenueCatInvoice, refundRevenueCatInvoice
insertInvoices.ts:194          bulk ON CONFLICT upsert, may move a
                               row between customers (invoices.insert)
invoiceRefundUtils.ts:165      refunded_amount += x
                               (refund route, cancel with refund)
handleMarketplaceInvoiceRefunded.ts:108   refunded_amount = x
executeStripeBillingPlanRollback.ts:64    DELETE by stripe_id
FK cascade                     customer / entity / org delete
```

None of these writes runs inside a DB transaction (the cascades excepted, and
those delete the customer with it). The FullSubject invalidation today is
route-level (`refreshCacheMiddleware`) and webhook-level
(`stripeWebhookRefreshMiddleware`), and the audit found writes neither covers:
`POST /billing.restore`, legacy `POST /checkout`, referral redeem, the refund
route, deferred attach (`preserveSubjectCache`), allocated-invoice updates
during track. A route-level design would inherit every one of those holes.

## Design

**The unit is the row, and the repo that writes the row drops its key.** No
route list, no webhook list, no event names to keep in sync.

```
                  packages/cache                      server
┌──────────────────────────────────┐   ┌───────────────────────────────┐
│ subscriptions/subscriptionCache  │   │ miscCache/getMiscCacheContext │
│   key  subscription:{stripe_id}  │   │   { miscCache, logger } once  │
│   get / set / invalidate         │   ├───────────────────────────────┤
│                                  │◄──│ SubService.*      ─► DEL keys │
│ invoices/customerInvoicesCache   │◄──│ InvoiceService.*  ─► DEL key  │
│   key  invoices:{internal_cus}   │   ├───────────────────────────────┤
│   get / set / invalidate         │   │ subscriptions/actions/        │
│                                  │◄──│   readCachedSubscriptions     │
│ both: JSON.parse on read,        │   │ invoices/actions/             │
│ resolve({requestId}) for reads,  │◄──│   readCachedCustomerInvoices  │
│ forEachTarget for invalidation   │   │        ▲                      │
└──────────────────────────────────┘   │ readBalanceWorkerSubject      │
                                       └───────────────────────────────┘
```

Server code imports the package actions directly and passes
`ctx: getMiscCacheContext()`. No per-family binding: auto top-up has one only
because it maps `AutumnContext` to `orgId`/`env`, which these keys never need.
Every family moved into the package later needs zero new server files.

Why one key per subscription and one list per customer:

- A subscription row knows its `stripe_id` and nothing about its customer
  (no customer column). Every `SubService` write has the stripe id in hand or
  in `.returning()`. A customer-keyed cache would need a `customer_products`
  lookup on every write, which is the bolt-on.
- The read already collects stripe ids from fresh worker state, so a product
  gaining or losing a subscription id needs no invalidation at all.
- An invoice row carries `internal_customer_id`, and the read is "this
  customer's latest ten". Every `InvoiceService` write has the internal id in
  hand or in `.returning()`.

Read-through, run through one request:

```
scenario  customer cus_1 on pro (sub_A), expand=invoices, cache empty
action    customers.get
          GET subscription:sub_A       → miss
          SELECT ... stripe_id IN (sub_A)
          SET subscription:sub_A  {row}  EX 3600
          GET invoices:cus_1_internal  → miss
          SELECT ... LIMIT 10
          SET invoices:cus_1_internal [rows]  EX 3600
expect    same response as today; second get does two GETs, no SQL

action    Stripe sends customer.subscription.updated (period rolled)
          syncAutumnSubscription → SubService.updateFromStripe
            UPDATE subscriptions ... RETURNING *
            DEL subscription:sub_A       (on every misc target)
expect    next get misses sub_A, reads the new period from Postgres
```

Rules the actions follow:

- `packages/cache` actions take `{ ctx: { miscCache, logger }, ... }` like
  `autoTopUpSuppression.ts`, with the server's ctx from one memoized
  `getMiscCacheContext()`; reads use `miscCache.resolve({ requestId })`,
  invalidation uses `forEachTarget` so a ramped instance never serves stale
  rows (`orgWithFeaturesCache.ts:97-136` precedent).
- Cached JSON comes back as-is (`JSON.parse(raw) as T`), like every other
  misc family. A key-format change is the migration story, not a validator.
- Multi-key reads are parallel single GETs, not MGET, for the same CROSSSLOT
  reason the org cache does one DEL per key.
- `ctx.skipCache` bypasses the read entirely, like `usesSubjectCache.ts:12`.
- The repo awaits the DEL after the write returns; Redis down is a warn
  (`tryRedisOp`), never a failed write. TTL is the bound on the
  miss-then-stale-set race and on any staleness that slips past.
- Invalidation lives in `InvoiceService` / `SubService`, not in middleware.
  This is deliberately different from the FullSubject rule: that cache is a
  subject-shaped composite the writer cannot name; these keys are named by
  the written row itself.

Precondition for the invoice half: the four bypass writers move into
`InvoiceService` (`upsertMany`, `addRefundedAmount`, `update` with
`refunded_amount`, `deleteByStripeId`), so the table is written from one file.
`insertInvoices` keeps passing the previous owners it already computes, since a
moved invoice must drop both customers' lists.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | TTL | 3600s for both. Long enough to serve a hot customer's reads all hour; short enough to bound a rename or a missed race. |
| 2 | Missing subscription rows (a product's stripe id with no row) | No negative cache in v1; the IN query is indexed. Revisit if reads show repeat misses. |
| 3 | Plan rename staleness on `plan_ids` | Accept, bounded by TTL. Same as the legacy blob today. `executeRenamePlans` cannot enumerate customers cheaply. |
| 4 | Legacy path | Untouched. It caches both inside the FullSubject blob and is being retired. The new keys are invalidated on every write regardless of path, so a customer flipping between paths sees no stale row. |
| 5 | Entity subjects on the worker path | Stop reading invoices for them (never rendered). Caching `getApiEntityExpand`'s entity invoice read is a separate unit, not in scope here. |
| 6 | Dead `SubService` methods and `addProductFromSubs` | Delete rather than wire invalidation into dead code. |
| 7 | Write-through instead of DEL | No. The invoice list needs `resolved_product_ids` and ordering only the SQL knows; DEL keeps both actions to get/set/invalidate. |

## Units

See `units.md`; the case matrix is in `cases.md`.
