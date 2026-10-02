---
author: john + claude
feature: balance-worker-stripe-webhooks
date: 2026-10-01
status: research — decisions open, nothing implemented
---

# Stripe webhooks through the balance worker: research

Goal: every Stripe webhook that changes a customer's rows lands as **one** `AutumnBillingPlan`,
applied **once** through `executeAutumnBillingPlan`, so the worker orders it against tracks like
any other plan. Today each handler's writes are spread across its tasks, hit Postgres directly,
and rely on an evict afterwards. Builds on `plans/balance-worker-apply-plan/overview.md` (lanes,
op shapes) and `plans/balance-worker-pool-writes/` (pools; unit 5 deferred the webhooks here).

Macro first (the shape of every webhook), then micro (each handler's writes, line by line).

## 1. How a webhook meets the worker today

```
stripeToAutumnCustomerMiddleware
  flushBalanceWorkerCustomer        worker → PG        (:50)
  CusService.getFull  →  snapshot R  PG                (:52)
          │
handler   │  compute from R, write PG as you go
          │  (sets, increments, inserts; a few mini-plans
          │   through executeAutumnBillingPlan)
          ▼
stripeWebhookRefreshMiddleware
  deleteCachedFullCustomer           → evict worker    (:155)
                                     → bump Redis epoch
```

Tracks keep flowing into the worker the whole time. The worker's copy is R until the evict.

What that costs, concretely (committer guards are **off**, `BALANCE_WORKER_COMMITTER_GUARDS_ENABLED
= false`, so every worker write lands unconditionally):

```
case A · a cycle reset (invoice.created)

 worker: ce.balance 100 (R)
 webhook reads R: usage = 900 → bills 900 on the invoice
 track −5 ─► worker 95 ─► log: increment −5
 webhook: UPDATE balance = 1000 (set)               PG 1000
 committer: balance += −5                           PG 995
 evict → worker reloads 995

 the 5 was never billed (it was usage of the OLD
 cycle) and now eats the NEW cycle's allowance.
 reverse order: PG 95 → set 1000: the 5 vanishes.
```

```
case B · a product flips status (sub.updated/deleted)

 worker: product P active (R)
 webhook: UPDATE P status = expired                 PG
 track on P ─► worker still active → allowed,
               increment lands on an expired row
 evict → worker reloads → P gone

 window = webhook duration (Stripe round-trips
 inside: 100s of ms to seconds)
```

```
case C · an evict that lands on nothing

 worker: loading A (not resident yet)
 webhook: writes A, evicts A → nothing to drop
 worker: load finishes, stores the PRE-write A
 (open hole, plans/balance-worker-concurrent-writers.md)
```

So the direct-PG-then-evict pattern is not a race-free design even with a perfect evict; it is a
"usually fine" design whose failure is silent (a lost or double-counted deduction, a decision on a
dead product). That is the gap this plan closes, handler by handler.

What already works: `executeAutumnBillingPlan` routes any plan whose rows the worker holds
(`billingPlanRoutesToWorker`), applies it as **one** mutation on the customer's partition, and the
worker answers once Postgres has it (`writeCustomerRowsThroughWorker`). A plan reaching the executor
is already atomic against tracks. The job is to get every webhook write **into** a plan.

## 2. Macro map: events → handlers → doors

Four doors a webhook write goes through today:

```
 ┌─ door 1 ─ executeAutumnBillingPlan ─── worker (routed) ──┐
 │           one mutation, ordered vs tracks               │ ok
 ├─ door 2 ─ CusProductService / CusEntService /           │
 │           RolloverService / RepService direct ─ PG ─────┤ gap
 ├─ door 3 ─ pooled side path: refresh → resetPooled       │
 │           → executePooledBalancePlan (own txn) ─ PG ────┤ gap
 └─ door 4 ─ legacy v1 insert: createFullCusProduct ─ PG ──┘ gap
```

| event | handler | doors used | ack |
|---|---|---|---|
| `invoice.created` | `handleStripeInvoiceCreated` | 2 (sets, increments, rollovers), 3 (pool resets) | sync for `subscription_cycle` |
| `customer.subscription.updated` | `handleStripeSubscriptionUpdated` | 1 (mini-plans ×N per product), 2 (status/cancel/renew/anchor/options), 3, 4 (`scheduleDefaultProduct`), plus `syncV2` (door 1, its own plan) | sync unless Autumn-originated |
| `customer.subscription.deleted` | `handleStripeSubscriptionDeleted` | 2 (arrear reset), 1 (mini-plans ×N), 3 | sync unless Autumn-originated |
| `customer.subscription.created` | `handleStripeSubscriptionCreated` | 1 (`activateScheduled` mini-plan), 2 (`subscription_ids` link), `syncV2` | sync unless Autumn-originated |
| `checkout.session.completed` | `handleStripeCheckoutSessionCompleted` | 1 (the deferred plan, once) + 2 (`promotePendingCustomerProducts` link-back) | sync, under `withBillingLock` |
| `invoice.paid` (deferred) | `executeDeferredBillingPlan` | 1 + 2 (same link-back) | sync when metadata |
| `subscription_schedule.updated` | `handleStripeSubscriptionScheduleUpdated` | 2 (`starts_at`, detach = delete/update) | early |
| `subscription_schedule.released` | `handleStripeSubscriptionScheduleReleased` | 2 (detach) | early |
| `subscription_schedule.canceled` | `handleSubscriptionScheduleCanceled` | none (reads then returns) | early |
| `checkout.session.expired` | `handleStripeCheckoutSessionExpired` | 2 (`expireIfPending`) | sync |
| `customer.updated`, `customer.discount.deleted`, `invoice.updated/finalized`, `invoice.paid` (non-deferred) | — | not subject rows (customer name/email, rewards, invoices) | — |

`webhookHandlers/handleInvoiceCreated/` (the old folder) is not dead: Vercel marketplace
`invoice.paid` still calls its `sendUsageAndReset`; it is out of scope here.

Locks: only checkout (`withBillingLock`, waits) and the HTTP billing routes (fail-fast) hold a
per-customer lock. `invoice.created`, `sub.updated`, `sub.deleted` run unlocked against each other
and against attach/update. Stripe fires `invoice.created` and `sub.updated` for the same cycle
within seconds of each other.

## 3. Micro map: every write, per handler

Kinds: **S** structural set (status, options, ids, anchors) · **B=** balance set (reset by intent)
· **B±** balance increment · **I** insert · **D** delete · **P** pool side path · **plan** already a
plan through the executor.

### 3.1 `invoice.created` (the balance one)

Order inside the handler, each step its own autocommit statement(s):

| # | step (file) | writes | kind | what the worker thinks |
|---|---|---|---|---|
| 1 | `processConsumablePricesForInvoiceCreated` | Stripe: add usage lines from snapshot R; then `CusEntService.batchUpdate` (:502) sets `balance`, `adjustment`, `entities`, `next_reset_at` (arrear reset); `deleteCachedFullCustomer` (:509, mid-handler evict); `RolloverService.insert` (:529) | B=, I | case A above; a track between R and :502 is unbilled and wiped or double-charged |
| 2 | `processPrepaidPricesForInvoiceCreated` | `CusProductService.update options` (:93, upcoming_quantity promote); `CusEntService.decrement` (:105, lifetime) ; `RolloverService.insert` (:131); `CusEntService.update` (:143) sets `balance` (`getResetBalancesUpdate`), `next_reset_at`, `reset_cycle_anchor`, zeroes a pool SOURCE | S, B±, I, B= | the worker holds the row; the set lands under it |
| 3 | `processAllocatedPricesForInvoiceCreated` | `CusEntService.update entities` (:55), `CusEntService.increment` (:64, +replaceables), `RepService.deleteInIds` (:70) | B=, B±, D | `entities` is a set of a jsonb the worker increments by key |
| 4 | `resetSubscriptionPooledBalances` | anchor-reset: `computeScheduledPooledAnchorResetPlan` → `executePooledBalancePlan` + `CusEntService.update reset_cycle_anchor`; cycle: `resetPooledBalances` (POOL_CE `balance = granted`, rollovers) | P, B= | the worker also resets this pool on its own clock (`pool-writes` research, gap 3): a double refill |
| 5 | `consumeBillingCycleAnchorReset` | `CusProductService.update billing_cycle_anchor, billing_cycle_anchor_resets_at` | S | — |
| 6 | `upsertAutumnInvoice`, `storeRenewalLineItems` | `invoices`, SQS | lane 4 | not subject state |

Everything in 1–5 is a facet `AutumnBillingPlan` already expresses: `updateCustomerEntitlements`
(`updates` for B=, `balanceChange` for B±, `insertRollovers`, `deletedReplaceables`),
`updateCustomerProducts` (S), `pooledBalancePlan` (P). The engine's `updateCustomerEntitlementsToPlanOps`
turns them into `update` / `increment` ops today. **One plan covers the whole handler.**

The one facet a plan cannot express correctly is the arrear/prepaid **reset itself** (steps 1, 2):
`balance = allowance` computed from R loses a track between R and apply. The worker's own `reset`
command (`customerEntitlementToResetChanges`) solves exactly this by deciding against live state.
So `invoice.created` needs the reset to travel as an **intent** (reset this row to the new cycle,
carry the usage since R onto the invoice or the next one), not as a set. This is decision 2.

### 3.2 `customer.subscription.updated` (the spread-out one)

Order inside the handler:

| # | task | writes | kind |
|---|---|---|---|
| 1 | `handleSchedulePhaseChanges` → `activateScheduledCustomerProducts` | per product: `reapplyExistingUsagesToCustomerProduct` (direct `CusEntService.update balance/entities` from R: a snapshot carry-over), `reapplyExistingRollovers…`, then a **mini-plan** (`activateScheduled.ts:91`, status/ids/starts_at + license pool plan) | B=, I, plan |
| | → `expireEndedCustomerProducts` | per product: `preserveOneOffPrepaidCarryOvers` (`EntitlementService.insert` + `CusEntService.insert`), **mini-plan** expire (`expireAndActivateDefault.ts:46`), then `activateFreeSuccessorProduct` → another activate mini-plan or `activateFreeDefaultProduct` (mini-plan insert, :83); `expiredCache.set` (Redis) | I, plan ×2–3 |
| | → `releaseScheduleIfLastPhase` | Stripe release; `CusProductService.updateByStripeScheduledId scheduled_ids: []` | S |
| | → `reconcileLicenseStateForCustomer` | license counters + seats, cache delete | C (licenses; out of scope here) |
| 2 | `syncCustomerProductStatus` | per product `CusProductService.update status/trial_ends_at/collection_method` (:174); `fixUnexpectedStatuses` → `updateByStripeSubId` | S |
| 3 | `handleStripeSubscriptionCanceled` | per product `CusProductService.update canceled/canceled_at/ended_at` (:88); `scheduleDefaultProducts` → `createFullCusProduct` (door 4: v1 inserts of cusProduct + cusEnts + cusPrices) | S, I |
| 3b | `handleStripeSubscriptionRenewed` | per product `CusProductService.update` clear cancel (:89); `CusProductService.delete` scheduled (:121) | S, D |
| 4 | `syncAutumnSubscription` | `subscriptions` row | lane 4 |
| 5 | `handleCancelOnPastDue`, `handleIgnorePastDue` | Stripe only | — |
| 6 | `autoSyncUpdatedSubscription` | `expireRemovedCustomerProducts`: `CusProductService.update` expired (:67); `billingActions.syncV2` (its own full plan) | S, plan |
| 7 | `applyPooledBalanceTransitions` | door 3 (refresh → reset pools → compute → `executePooledBalancePlan` → refresh) | P |

Count for a single phase advance of one product: 2 carry-over sets, 1 insert, 2–3 mini-plans, 1
status set, 1 pool side path, 4 evicts. Each mini-plan is atomic on its own, but the worker sees the
customer pass through 5–6 intermediate states, and the carry-over balances are **sets from R**.

### 3.3 `customer.subscription.deleted`

| # | task | writes | kind |
|---|---|---|---|
| 1 | `processConsumablePricesForSubscriptionDeleted` | Stripe: create + pay arrear invoice from R; `CusEntService.batchUpdate` reset (:137); evict (:142) | B= |
| 2 | `expireAndActivateCustomerProducts` | per product: expire mini-plan + successor (as 3.2 step 1); `deleteScheduledCustomerProduct` (`CusProductService.delete`); then door 3 pools; `expiredCache.set` | plan ×N, D, P |
| 3 | `voidInvoicesForSubscriptionDeleted` | Stripe | — |

Same shape as 3.2 with an arrear reset in front. Note the ordering: the reset (B=) happens
**before** the products expire, so a track in between lands on a row that is both reset and about
to expire.

### 3.4 `customer.subscription.created`

`linkScheduledCustomerProductsToSubscription`: `activateScheduled` mini-plan when started, else
`CusProductService.update subscription_ids` (:67). Then `syncV2` under a lock. Then `subscriptions`.
Small; folds into the same shape.

### 3.5 `checkout.session.completed` / deferred `invoice.paid`

Already one plan (the deferred `AutumnBillingPlan`), executed once, under `withBillingLock`. Two
leftovers: `promotePendingCustomerProducts` writes `CusEntService.update balance/entities` and the
status flip **before** the executor runs (two writes, not one), and `publishBillingTransition` is
skipped on the rollout (the worker carries usage itself). Apply-plan overview unit 2 already names
the link-back as an `update` op. Low risk; last.

### 3.6 Schedule events, checkout expired

`starts_at` resync, `scheduled_ids` clear, detach (delete scheduled rows, clear `ended_at`),
`expireIfPending`: all **S**/**D** on `customer_products`, all direct. Each is a one-facet plan
(`updateCustomerProducts` / `deleteCustomerProducts`). Mechanical.

## 4. The gaps, named

```
 G1  direct PG writes to rows the worker holds, then evict
     (every door-2 site above)                     → plan ops
 G2  N mini-plans per event instead of one
     (activate / expire / default / delete)        → one plan
 G3  balance SETS computed from the snapshot
     arrear + prepaid resets, carry-over on activate,
     pool refills                                  → intents the
                                                     worker resolves live
 G4  the pooled side path (door 3) refreshes and
     writes outside the executor                   → pooledBalancePlan
                                                     facet of the one plan
 G5  door 4: createFullCusProduct (v1) for a
     scheduled default                             → insertCustomerProducts
 G6  no lock / no structural guard: invoice.created,
     sub.updated, sub.deleted and attach interleave → decision 5
 G7  mid-handler evicts (:509 in 3.1, :142 in 3.3,
     3× inside door 3) flush the worker while the
     handler is still writing                      → gone with G1
```

G1, G2, G4, G5 are mechanical once the shape is agreed. G3 is the design question; G6 is the
policy question.

## 5. Target shape

```
 webhook handler
 ├ setup     snapshot R (as today: flush, getFull)
 │           + Stripe reads (invoice, sub, customer)
 ├ compute   PURE: tasks append to ONE AutumnBillingPlan
 │           ├ updateCustomerProducts   status, cancel, anchors,
 │           │                           options, ids, starts_at
 │           ├ insertCustomerProducts   successor / default
 │           ├ deleteCustomerProducts   scheduled, detached
 │           ├ updateCustomerEntitlements
 │           │   balanceChange (±), rollovers, replaceables
 │           │   + NEW: reset intents (G3)
 │           ├ pooledBalancePlan        transitions + refills
 │           └ (licenses: unchanged, lane C)
 ├ Stripe    line items, invoice, release schedule (as today)
 ├ execute   executeAutumnBillingPlan(plan)   ONCE
 │           └ worker: one mutation, one Kafka record,
 │             one PG transaction
 └ after     webhooks, expiredCache, invoice upsert, logs
```

This is the shape attach/update/cancel already have (`billingActions.*`). The webhook handlers
become one more `billingAction` each, and `eventContextToAutumnBillingPlan` (today a payload
helper) becomes the real thing.

Order of Stripe vs. execute matters per event: for `invoice.created` the Stripe lines must be on
the invoice before the reset lands (today's order, kept); for `sub.deleted` the arrear invoice must
be **paid** before the reset (today: `if (!paid) return` before the reset). The plan is built
first, Stripe runs, then the plan executes; a Stripe failure means no plan executes, same as today.

## 6. Decisions, in order (one at a time)

| # | question | recommendation |
|---|---|---|
| 1 | **Shape.** One plan per webhook event, tasks become pure compute, one `executeAutumnBillingPlan` at the end? Or keep per-task mini-plans and only move the door-2 writes into them? | One plan. Mini-plans keep G2 and the intermediate states; the executor already handles a plan with every facet. |
| 2 | **Resets as intents (G3).** For the cycle reset and the activate carry-over: (a) keep `balance = X` sets from R (today's semantics, lost tracks in the window), (b) a `reset` op the worker resolves against live state (bill what R saw, carry usage since R onto the row, as the worker's own reset does), (c) route the whole reset through the existing `reset` command and let the webhook only mark `next_reset_at`. | (b): the plan carries `{ op: "reset", id, cycleEndedAt, newAllowance }`; the engine reuses `customerEntitlementToResetChanges`. The usage between R and apply is the one number the server cannot know. |
| 3 | **Which event first.** `invoice.created` (balances, highest race cost, one handler) or `sub.updated` (most spread out, structural)? | `invoice.created`: it is where a lost track is money; sub.updated's races are status flips a track survives. |
| 4 | **Pools (G4).** Fold `applyPooledBalanceCustomerProductTransitions` and `resetSubscriptionPooledBalances` into the one plan's `pooledBalancePlan`, and let the worker's reset own subscription-mode refills (pool-writes unit 4 "not done")? | Yes; it is the deferred half of pool-writes unit 5. |
| 5 | **Serialization (G6).** Per-customer lock on the three unlocked handlers (`withBillingLock`, they are early-acked or sync and can wait), or the structural revision from apply-plan decision 2, or both? | Lock now (cheap, exists), structural revision when apply-plan ships it. |
| 6 | **Door 4 / v1.** `scheduleDefaultProduct` → `createFullCusProduct`: port to `insertCustomerProducts` on the plan, or leave and evict? | Port; it is the only v1 insert left on a webhook. |

## 7. Unit sketch (not committed; follows the decisions)

```
 0  lock the three handlers
 1  invoice.created: one plan, sets as today (G1, G4, G7)
 2  reset intent op in the engine; invoice.created uses it (G3)
 3  sub.deleted: one plan (arrear reset = unit 2's op)
 4  sub.updated: one plan (activate/expire/default/cancel/renew)
    carry-over as a transfer op (apply-plan), door 4 ported
 5  sub.created, schedule.*, checkout link-back
 6  integration sweep on the rollout
```

Each unit: a test that races a track against the webhook and asserts the deduction is neither lost
nor doubled, on the worker path.

## Parked

- Licenses (`reconcileLicenseStateForCustomer`, `batchTransition`): lane C, their own plan.
- Migrations, `batchTransitions`: next after webhooks, same shape.
- The in-flight-load evict hole (case C): worker-side fix, independent of this plan.
