---
author: john + claude
feature: balance-worker-apply-plan
date: 2026-09-22
status: draft, not yet approved
---

# Applying an AutumnBillingPlan through the balance worker

The general form of "structural writers become worker commands"
(`plans/balance-worker-concurrent-writers.md`). Every billing action already ends in one object,
`AutumnBillingPlan`; this plan says how that object reaches Postgres through the worker, so a billing
change and a track on the same customer are ordered by one writer and nothing is evicted.
`plans/balance-worker-get-or-create/` is the first instance.

## What exists today

### one executor, 22 steps, three kinds of work

`executeAutumnBillingPlan` (`server/src/internal/billing/v2/execute/executeAutumnBillingPlan.ts`) runs
22 steps, each its own autocommit statement (only `createWithDefaults` wraps it in a transaction). Three
execution shapes call it:

- **Stripe, then Autumn** (`executeBillingPlan.ts:30,83`): attach, multiAttach, createSchedule, update,
  cancel, autoTopup. The Stripe phase itself writes `subscriptions`, `invoices` and deferred metadata to
  Postgres (`executeStripeSubscriptionAction.ts:125-178`), outside the plan.
- **Autumn, then Stripe, then a link-back**: create (`finalizeCreateCustomer`, a direct update) and
  checkout with `enable_plan_immediately` (`handleCheckoutSessionEnabledImmediately`, through the
  executor). Deferred mode inserts `pending` rows first and promotes them on the webhook
  (`promotePendingCustomerProducts`, a direct update).
- **Autumn only**: ~14 callers (sync, syncV2, restore, rollback, licenses, trial expiry, scheduled
  activation, entity defaults, …).

```
 kind                          steps                                                    tables
 ─────────────────────────     ─────────────────────────────────────────────────────    ───────────────────────────────
 A  subject rows               cusEnt insert · patch · entity insert · insertNewCusProducts    customers · entities · customer_products
    (one customer, the rows    pooled plan · currency lock · cusProduct update/delete           customer_prices · customer_entitlements
    the worker holds)          cusEnt updates + increments · one-off / auto-topup rebalance     rollovers · replaceables · pooled_balances
                                                                                                pooled_balance_contributions
 B  catalog / ledgers          custom ents/prices/trials · plan licenses · schedule phases      entitlements · prices · free_trials
    (not subject state)        invoice upsert · line-item workflows                             plan_licenses · schedules · invoices · SQS
 C  licenses                   license updates · transitions · reconcile                        customer_licenses + seat cusProducts/cusEnts
    (excluded from the worker today: subjectRowsSql.ts:59 drops license-linked products)
```

Facts that shape the design:

- **Balances move by SQL arithmetic, never by set.** `adjustBalanceDbAndCache` is `balance = balance ± d`
  (`CusEntitlementService.ts:724`); pooled `granted` likewise. The plan's `balanceChange` is a delta.
  Structural columns (`status`, `options`, `trial_ends_at`, `subscription_ids`) are plain sets by id.
- **Carry-over is resolved against live balances, not the snapshot.** `publishBillingTransition` hands
  Redis a Lua that folds the usage accrued since compute onto the incoming cusEnt, then CASes the result
  back to Postgres (`persistPublishedBalanceTransitions.ts:36-61`). That is the one facet where
  "apply what compute decided" is wrong.
- **Execute reads Postgres in five places**: `applyDerivedCustomerProductIsCustom` (catalog),
  `replaceScheduledPhaseCustomerProductIds` (schedules), `executeOneOffPurchaseRebalance` (a whole
  `CusService.getFull`), `SubService.upsertByStripeId` (read-modify-write), `reconcileLicenseStateForCustomer`
  (many). Everything else is data on the plan.
- **Billing-vs-billing is only partly serialized.** HTTP billing routes take a fail-fast route lock
  (`lock:attach:{org}:{env}:{customerId}`, `routeHandler.ts:352-365`, off in development);
  `withBillingLock` covers two webhook tasks. Create, setup_payment, the deferred-invoice webhook and
  crons run unlocked.
- **`subscriptions` is not subject state.** The row has no customer column (it hangs off
  `customer_products.subscription_ids`), and no billing decision reads `fullCustomer.subscriptions`;
  only API responses do. Its main writer is the Stripe phase, not step 18.
- **Redis patches ride along** on steps 15, 17, 19 (`adjustSubjectBalanceCache`, `upsertCachedInvoiceV2`);
  they are the cache half of a write the worker replaces.
- **Deferred execution is the same plan, later.** Checkout / invoice mode store the plan and run the
  Autumn execute from a webhook (`executeDeferredBillingPlan.ts:68`). A plan is data; nothing changes.
- **A mid-plan failure leaves partial writes today** (no transaction); `actions/rollback` compensates.

## Target model

### one action shape, three lanes

```
 setup      subject ← worker read { state, revision R }      PG / Stripe for catalog, schedules, invoices
 compute    AutumnBillingPlan                                 unchanged; absorbs the five execute-time reads
 evaluate   StripeBillingPlan                                 unchanged
 execute    ┌ 1 server   catalog rows, plan licenses          PG, before: the subject rows reference them
            │ 2 Stripe                                        unchanged (create: after lane 3, see below)
            │ 3 worker   applyPlan { ops }                    subject rows: one mutation, one Kafka record, one PG txn
            └ 4 server   schedules, invoices, workflows       PG / SQS, after
```

Lanes 1 and 4 are not subject state and race nothing the worker holds; they keep today's guarantees
(and today's partial-write hole). Lane 3 is where atomicity was missing and where it now lives.

### the command: intents in, concrete changes out

```ts
ApplyPlanCommand { ...base, catalogRows, ops: PlanOp[] }

PlanOp =
  | { op: "insert",    table, row }                        full shared row
  | { op: "upsert",    table, row }                        contributions by source, rollovers by id
  | { op: "update",    table, id, set, guard? }            guard = the structural columns compute read; never a balance
  | { op: "delete",    table, id }
  | { op: "increment", table, id, add, floor?, ceiling? }  balances, granted, license remaining: commutes with tracks
  | { op: "transfer",  from: cusEntId, to: cusEntId }      carry-over: resolved against live balance
  | { op: "capRollovers", cusEntId, max }                  rollover max-clearing: resolved against live rollover balances
  | { op: "setIfNull", table, id, column, value }          currency lock
  | { op: "expireIfEmpty", pooledBalanceId, expiresAt }    pool expiry: resolved against live contribution count

ApplyPlanReply { result: { status: "applied" | "customer_exists" | "entity_exists" },
                 changes, state, catalog }
```

The worker resolves every op against the freshest state inside `decide`, the same step a track uses,
and logs **concrete** `RowChange`s (an `increment`, a guarded `update`, an insert). Replay, the
follower and herald see only concrete changes; the command is the intent the log remembers. This is
exactly track's shape: `command: track 5` → `changes: increment −5`.

Two rules from get-or-create hold for every op:

- **Changes carry whole rows and any column; state keeps a pick.** An `update` may set a column the
  worker does not hold (`subscription_ids` today); the committer writes it, memory ignores it, and it
  can carry no worker-checked guard. State holds what `customers.get` renders; writers not yet routed evict.
- **Inserting the customer or an entity is a precondition** (absent, else `customer_exists` /
  `entity_exists`), so create is an `applyPlan`, not a sibling command.

### why a plan computed at R is still right at R + n

Between the read and the apply, tracks move rows; unlocked billing callers can too, which the
structural revision below catches:

| plan facet | expressed as | under a concurrent track |
|---|---|---|
| balance adjustments, rebalances, pooled grant | `increment` | commutes |
| carry-over | `transfer` | reads the live source in `decide` |
| status, options, trial, subscription_ids, ended_at | `update` with `guard` on the picked ones (status, options, ended_at); unpicked ones (trial, subscription_ids) rely on the structural revision | untouched by tracks; a guard miss is 409 `stale_subject` |
| new rows | `insert` | unique index is the backstop |

Two revisions, not one. Tracks bump the subject `revision`; only `create` and `applyPlan` bump a
`structuralRevision`. The command carries the structural revision compute read; a mismatch is 409
`stale_plan` and the action re-runs setup. Tracks never trip it, so a plan that raced a track applies;
two plans that raced each other do not. Today only the HTTP billing routes hold a per-customer lock
(`handleAttachV2.ts:21` and siblings); crons, webhooks and entity flows run unlocked, so this guard is
new protection, not a replacement for one that exists.

### the facet map: every step of `executeAutumnBillingPlan`, in order

Read line by line, including the SQL. `→3` is the worker; `→1`/`→4` are server Postgres before and
after; `→C` is licenses, server-side until they join the worker.

| # | step | what it writes today | lane | op(s) | resolved live? |
|---|---|---|---|---|---|
| 1 | `applyDerivedCustomerProductIsCustom` | nothing; reads catalog, stamps `is_custom` onto the plan | compute | — | no |
| 2 | `insertCustomCatalogRows` | `entitlements`, `prices`, `free_trials` | 1 | — | — |
| 3 | `executeInsertPlanLicenses` | custom items, `plan_licenses`, junction rows (delete-then-insert) | 1 | — | — |
| 4 | `CusEntService.insert` (`insertCustomerEntitlements`) | `customer_entitlements` (balance ?? 0) | 3 | insert | — |
| 5 | `executePatchCustomerProducts` | cusEnt/cusPrice inserts and deletes, **rollover inserts with max-clearing** | 3 | insert · delete · capRollovers | clearing sums live rollover balances (`rolloverUtils.ts:165`) |
| 6 | `executeCustomerLicenseUpdates` | `customer_licenses`: `setPaidQuantity` arithmetic, `takeAssignment` CAS `remaining >= n` (400 on miss), `LEAST(remaining+n, granted)` release | C | later: increment with floor / ceiling | yes |
| 7 | `EntityService.insert` | `entities` (23505 → 409) | 3 | insert | — |
| 8 | `insertNewCusProducts` | `customer_products`, `customer_licenses` (conflict-ignore), `customer_entitlements`, `customer_prices`, rollovers with max-clearing | 3 (+C for the license rows) | insert · capRollovers | as 5 |
| 9 | `executePooledBalancePlan` (own txn) | insert pool: catalog `entitlements` + pool cusEnt + `pooled_balances`; update pool: cusEnt `balance += d`, pool `granted += d` plus set fields; contributions upsert-on-source then **source cusEnt set** `balance=0, adjustment=0, additional_balance=0, entities=null, pooled_contribution_id`; pool rollovers insert-ignore; contribution updates; contribution delete + source unlink; **expiry only if no contributions remain**; delete pool graph (pool → cusEnt → catalog entitlement) | 3, catalog row in 1 | insert · increment · update · upsert · delete · expireIfEmpty | expiry counts contributions across entity subjects |
| 10 | `executeCustomerLicenseTransitions` | pool row repoint/carry (arithmetic), then `batchTransition`: chunked `FOR UPDATE` CTEs over every seat: replace/add/delete seat cusEnts (`balance += d` or `balance = v`), pool aggregates (`contribution += d`, `granted += Σ`, synthetic `balance += Σ`), cycle alignment, seat cusProduct repoint, `insertPooledBalanceGraph` find-or-create; sync under N entities, else a trigger task | C | later: N chunked applyPlans on entity subjects + one customer-subject increment per chunk | yes |
| 11 | `replaceScheduledPhaseCustomerProductIds` | `schedule_phases.customer_product_ids`, prunes empty phases and spent schedules | 4 | — | reads phases |
| 12 | `lockCurrencyIfUnset` | `customers.currency WHERE currency IS NULL` | 3 | setIfNull | yes |
| 13 | `CusProductService.update` loop | `customer_products` set by id (status, options, trial, subscription_ids, canceled, ended_at, …) | 3 | update (guard: those columns) | — |
| 14 | `CusProductService.delete` loop | `customer_products` delete by id | 3 | delete | — |
| 15 | `updateCustomerEntitlements` | `updates` → **set** of `balance` / `adjustment` / `entities` / `next_reset_at` / `reset_cycle_anchor` (arrear cycle resets); `balanceChange` → `balance ± d`; replaceables insert / delete-in-ids; Redis balance patches | 3 | update (no balance guard: a reset is a set by intent) · increment · insert · delete | — |
| 16 | `executeOneOffPurchaseRebalance` | loads the whole customer, computes deltas, then 17 | compute | increment | the load moves to setup |
| 17 | `executeAutoTopupRebalance` | `balance ± d`, Redis NUMINCRBY | 3 | increment | — |
| 18 | `SubService.upsertByStripeId` | `subscriptions` read-then-update, else insert, else re-read (webhook race) | 4 | — (not subject state) | no |
| 19 | `invoiceActions.upsertToDbAndCache` | `invoices` on-conflict, CASE-guarded product_ids; Redis invoice patch | 4 | — | — |
| 20 | `triggerStoreInvoiceLineItems` | SQS | 4 | — | — |
| 21 | `triggerStoreDeferredInvoiceLineItems` | SQS | 4 | — | — |
| 22 | `reconcileLicenseStateForCustomer` | reads stranded licenses, seat counts by link, unused assignments; batched `UPDATE customer_licenses FROM VALUES`; expires surplus seat cusProducts; then `applyPooledBalanceCustomerProductTransitions` (3× cache delete + `getFull`, pool resets, a pooled plan) | C | later: its own action, setup → compute → applyPlan | — |
| every insert/update/delete of cusProduct, cusEnt, entity | `customer_lsns` mark on a separate autocommit pool (`markCustomerUpdatedAt.ts:120`) | committer | one mark per customer per flush | — |

Around the executor, same object, other doors:

| caller | what it does |
|---|---|
| `insertPendingCustomerProducts` (deferred) | inserts the plan's cusProducts as `status: pending` with `metadata_id` before Stripe resolves; `promotePendingCustomerProducts` flips them on the webhook. Two applyPlans: insert, then update. |
| `executeDeferredBillingPlan` | Stripe resume → promote pending → the executor → `persistDeferredCreateSchedule` → `publishBillingTransition` → webhooks → metadata delete → checkout complete → cache delete |
| `rollback` | `computeRollbackPlan` → the executor with the inverse plan → cache delete. An applyPlan like any other. |
| `applyPooledBalanceCustomerProductTransitions` | not through the executor: cache delete + `getFull` → `resetPooledBalances` → `getFull` → compute pooled plan → `executePooledBalancePlan` → `getFull`. Called from subscription webhooks, entity default attach, trial revert, license reconcile. Becomes setup (worker read) → compute → applyPlan; pool resets are the reset command. |
| `executeMultiSubscriptionBillingPlan` | N Stripe executions, then **one** executor call (`executeMultiSubscriptionBillingPlan.ts:49-81`): one applyPlan |
| `handleCheckoutSessionEnabledImmediately` | strips the plan to `updateCustomerProducts` only |

Every facet lands in a lane. What the first draft of this doc missed, found on the line-by-line pass:
rollover max-clearing reads live balances (a `capRollovers` op, not compute); pool expiry counts
contributions across entities (`expireIfEmpty`); contribution inserts also zero the source cusEnt
(entity-subject updates inside a customer-subject plan); subscription upsert is a live `upsert`, not a
compute-time choice; `updates.balance` on a cusEnt is a deliberate set and must not carry a balance
guard; `customer_lsns` gates replica reads and must keep being written; and a mutation spans one entity
today, never N.

### the executor, lane by lane

```
executeAutumnBillingPlan({ ctx, plan })
│
├ refused facet? ──────────────► today's 22 PG steps, whole plan       (until that facet routes)
│
├ lane 1  server → PG          customEntitlements · customPrices · customFreeTrial
│                              insertPlanLicenses + junction rows
│                              pool synthetic `entitlements` row
│
├ lane 3  server → worker      applyPlan { ops }       one mutation, customer's partition
│                              insert    customer · entities · cusProducts · cusEnts · cusPrices · rollovers
│                              update    cusProduct fields (guarded) · cusEnt reset/adjustment/entities
│                              incr      balanceChange · rebalances · pool cusEnt.balance · pooled_balances.granted
│                              transfer  carry-over
│                              setIfNull customer.currency
│                              pool      insert pool cusEnt + pooled_balances row · contributions upsert/delete
│                    ◄──────── { changes, state }
│
├ lane 4  server → PG / SQS    schedule phases · invoice upsert · line-item workflows
│
└ lane C  server, today's code customerLicenseUpdates      CAS take / capped release on customer_licenses
                               customerLicenseTransitions  repoint or carry the pool row, then batchTransition:
                                                             sync if < N entities, else trigger task,
                                                             chunked SQL over every seat's cusProducts/cusEnts
                               reconcileLicenseState       read-heavy converge, writes seats + pools
```

**Pooled balances** fit lane 3 except `expirePoolBalanceCandidates`: the pool expires only when zero
contributions remain, and contributions are unbounded (one per entity), so today only Postgres can
count them (`executePooledBalancePlan.ts:224`). Either a `contribution_count` column on
`pooled_balances` kept by increment, or expiry stays in lane 4 as a PG conditional. Recommended: the
column.

**Licenses** stay lane C until they join the worker (hydration drops license-linked products today,
`subjectRowsSql.ts:59`). When they do, each is more of the same unit:

```
customer_licenses    → state table on the customer subject
                       take / release = increment with floor 0 / ceiling granted   (a guarded increment, decision 14)
license transition   → update on the pool row (lane 3)
                       + batchTransition = N chunked applyPlan commands on entity subjects
                         same partition (key = customer), each chunk one atomic mutation vs tracks
                         a whale is still not atomic across chunks, same as today
reconcile            → its own action: setup (worker read + PG) → compute → applyPlan
                       not a tail inside execute
```

### what the worker's state grows to hold

The **wire** grows first: whole rows for `customers`, `customer_products`, `customer_prices`,
`entities`, then `pooled_balance_contributions` and `replaceables`, each when the first facet that
writes it routes. The **pick** grows only when a worker-side reader needs a column (`customers.get`,
billing setup) and every writer of that column already routes. Never in state: `subscriptions` (no
customer column, no decision reads it), invoices, events, schedules, licenses.

### the server side

```
server/src/internal/billing/v2/execute/
├── executeAutumnBillingPlan.ts          lane 1 → lane 3 → lane 4, in that order
├── applyPlan/
│   ├── autumnBillingPlanToPlanOps.ts    the facet map above; one file per facet family
│   └── refusesApplyPlan.ts              facets the worker can't take yet → whole plan on the PG path
└── executeAutumnActions/                the PG path, unchanged, until each facet is retired
```

`executeAutumnBillingPlan` becomes lane-ordered: it runs the PG steps for lanes 1 and 4 and calls the
worker for lane 3, or falls through to today's steps for a plan that is refused. Every caller keeps its
call site. The Redis patches on lane-3 steps go with them.

### failure between Stripe and lane 3

Today: Stripe done, Postgres not, `rollback` compensates. Same window, with two gains: `applyPlan` is
idempotent by command id inside the dedup window, so a retry is safe; and it is one mutation, so it
either landed or did not. Recovery retries lane 3 by command id.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Intents or concrete changes on the wire? | Intents. Carry-over and increments must resolve against live state; the log stays concrete. |
| 2 | Revision guard on the command? | A **structural revision**, bumped by `create`/`applyPlan` only. Tracks never trip it; racing plans do. Closes the unlocked cron/webhook races too. |
| 3 | Lanes 1 and 4 outside the mutation | Yes. They are not subject state; making them atomic with lane 3 means the worker writing catalog and ledger tables. |
| 4 | Licenses | Out, as today. They enter the worker as their own migration. |
| 5 | Refusal granularity | Whole plan: a plan with an unsupported facet takes today's PG path in full. Half a plan on each path is the worst of both. |
| 6 | `customer_lsns` marks | The committer writes the mark in the flush transaction. `resolveSubjectReadDb` reads it to gate replica reads; `customers.list` still reads Postgres. |
| 7 | Mutations that span many entities | Today a mutation projects the customer plus **one** entity (`pendingMutations.ts:118`). Pooled plans, entity-scoped attaches and seat transitions touch N. The writer must project N subject keys of one customer; same partition, so it is a bookkeeping change, not a consistency one. |

## Units, working backwards from create

| # | unit | ends with |
|---|---|---|
| 1 | **Insert ops; create routes.** `PlanOp` insert, the customer/entity precondition, whole-row changes, `routeAutumnBillingPlan`, `autumnBillingPlanToPlanOps`. | `plans/balance-worker-get-or-create/units.md` units 2–5 |
| 2 | **Update ops.** `update` with guards on picked columns, pass-through on unpicked ones. The link-backs (create's finalize, checkout enable-immediately, `promotePendingCustomerProducts`) route; `subscriptions` stays a Postgres write in the Stripe phase. | create's flow writes no worker-owned table outside the worker |
| 3 | **Attach, free and paid.** `autumnBillingPlanToPlanOps` for inserts/updates/deletes, `increment`, `transfer`; lane order in `executeAutumnBillingPlan`; refusal. | `billing/attach/*` upgrade and downgrade suites with a track in flight |
| 4 | **The rest of the balance facets.** rebalances, `setIfNull`, replaceables, pooled plan. | `autoTopup`, `one-off`, `pooled-balances` billing suites |
| 5 | **Every caller.** update, cancel, schedules, webhooks, deferred; delete the Redis patches and the lane-3 PG steps. | full billing suite on the worker path |
