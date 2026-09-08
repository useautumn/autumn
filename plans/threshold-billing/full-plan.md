---
author: Codex
feature: threshold billing
date: 2026-09-08
status: proposed
---

# Threshold billing

Implementation workspace: `charlie/threshold-billing`, based on `ed149b7118`. This plan supersedes implementation-plan.md and the earlier research recommendations where they conflict.

## Contract

- Threshold measures the configured item's feature units. For a credit-system item, these are credits after the effective rate-card/dimension conversion.
- With threshold 100 and overage 140, invoice exactly 100 units; success leaves 40 overage (remaining -140 → -40).
- Repeat within a billing period. One request with overage 240 produces separate 100-unit attempts subject to the rate limiter, not one 240-unit charge.
- Processing permits usage but reserves the invoiced 100 units against duplicate billing. First payment failure blocks further use of the affected plan unless ignore_past_due is true.
- Preserve included grants, usage history, reset anchors, and unrelated balances.
- API scope assumption: “reset api” means REST API only, without dashboard work. There is no verified public partial-reset endpoint in the inspected balance handlers. If a literal reset endpoint was intended, its contract needs confirmation; do not implement a grant-renewing reset for this feature.

## Existing machinery and corrections

Auto-top-up has a post-deduction enqueue, burst suppression, a worker sharing the attach lock, persisted counters, and a computed billing plan. Its current defaults are 2 attempts per 10 minutes and 1 failed attempt per hour (`autoTopUp/helpers/limits/autoTopupRateLimitConfigs.ts`). Its durable suspension starts after 3 failures (`recordAutoTopupAttempt.ts`); threshold billing blocks after the first failure instead.

`computeAutoTopupPlan.ts` builds a normal AutumnBillingPlan and Stripe invoice action, and carries additive rebalance deltas. Reuse that billing/action structure; do not call public billing.attach to buy the plan again.

`getCheckSubject.ts` currently depends on the organization overdue toggle and exempts allow_overdue_entitlements. It does not implement the requested ignore_past_due override. `prepareFeatureDeductionV2.ts` also conditionally enforces overdue blocking. Consequently simply marking a product past_due is insufficient to guarantee track rejection and can be undone by unrelated subscription webhooks.

The earlier thresholdBillingPlan field on attach would duplicate data already carried through prices/entitlements. Remove that proposal. Likewise do not introduce an append-only ledger before using invoice history plus one durable state record per billing scope.

## Step 1 — Item configuration and storage

Public API: add optional `threshold_billing: { threshold: number }` to the relevant priced feature item shape; follow the API's current item conventions rather than exposing internal ProductItem.config directly. Internal ProductItem.config can carry the same object to conversion. Store the authoritative setting in the matched usage price config: it controls when that usage price bills. Customer prices already reference the effective custom/versioned price.

Touchpoints: `shared/api/products/items/apiPlanItemV1.ts`, create/update item inputs, item version mappers, `shared/models/productV2Models/productItemModels/productItemModels.ts`, `shared/models/productModels/priceModels/priceConfig/usagePriceConfig.ts`, and item↔price conversions. Trace both directions so parsing never silently strips the field.

Validate finite positive units and eligibility: metered consumable pay-per-use item with a single per-unit rate, including credit-system items. Reject base-fee-only, free, boolean, unlimited, prepaid and allocated-seat items. Reject tiered/volume rates initially because resetting chunks can change effective tiers/flat charges. Match the thread's flat-item scope. Monetary amount still uses billing_units and the customer's effective currency price.

Config follows existing catalog version/customization semantics. Do not duplicate it onto customer-entitlement rows or introduce attach-time registration rows. Preserve it through variants and custom attach items; changing only the threshold must not force a new Stripe price when the actual rate is unchanged.

## Step 2 — Durable state using the auto-top-up pattern

Create one `threshold_billing_states` row per owning customer entitlement and entity sub-balance where applicable. For pooled entitlements, key the shared owning balance; dimensions select the effective credit rate, not separate counters unless they already represent distinct balance scopes. Do not aggregate the same feature across unrelated attached items/prices.

Minimum state: scope identifiers, attempt counter/window, current operation id, units, original billing-cycle identity, source balance allocations, invoice id, phase (`creating`, `processing`, `failed`, `settling`, idle), blocked timestamp, updated timestamp. Invoices and existing billing metadata retain completed charge history; retain the settled operation marker necessary for replay protection.

Unique scope + compare-and-set claiming prevent parallel workers. Use a stable operation id for every Stripe request and every settlement retry. Burst suppression and rate limiting limit traffic; they are not payment idempotency. Implement repos beside the threshold domain, matching autoTopUp/repos. Use shared pure window arithmetic where compatible, without renaming/refactoring the whole auto-top-up subsystem.

Persist the operation before calling Stripe. On timeout, resume that operation and reconcile the invoice rather than creating a new charge. Recover abandoned creating/settling operations with a retry job. Redis outage must not bypass payment locking or cause duplicate charges.

## Step 3 — Attach remains the existing pipeline

Trace `setupAttachBillingContext` → item/price conversion → `computeAttachNewCustomerProduct` → `computeAttachPlan` → `executeBillingPlan`. Preserve the setting in custom prices and normal catalog rows; no new threshold-specific AutumnBillingPlan field and no invoice/claim during attach preview.

Immediate attach activates normal resolved prices. Scheduled/checkout/deferred attaches make them available at existing activation boundaries. Existing customers adopting a new version follow existing migrations; an in-flight invoice keeps its original units/rate/scope regardless of later edits.

Tests prove config propagation, preview side-effect freedom, scheduled activation, and unchanged no-config attaches. Add validation in the existing item validation path, not a branch in attach.ts.

## Step 4 — Eligibility and bounded triggering

Add one lightweight trigger beside the existing post-deduction auto-top-up hook. Inspect canonical track, batch track, token track, and finalize-lock completion for shared coverage; do not charge provisional lock reservations. The hot path only finds eligible affected scopes and queues work.

Worker sequence: acquire customer attach lock → reload effective/live balances → check state + rate limit → claim exactly threshold units → compute bill → execute → settle. Reload must include accepted Redis-only deductions, following attach's runtime overlay/publication conventions.

Eligibility is `unreserved outstanding >= threshold`, not only a before/after crossing. Crossing-only logic loses work after rate suppression, processing, or a 240-unit spike. Re-evaluate on completion and schedule at the limiter's next eligible time. Use auto-top-up's 2 attempts/10 minutes as a conservative initial internal limit; each operation is one threshold chunk. This deliberately means catching up can take time.

## Step 5 — Compute and execute through billing primitives

Create a threshold action with setup, pure compute and execute, modeled on computeAutoTopupPlan. Resolve the owning customer price, effective billing units, currency, and applicable discounts; build one charge line item for exactly threshold units using existing pricing helpers.

Reuse invoice execution, Autumn invoice/line-item storage, metadata/deferred-payment handling where their contracts fit. Store operation/scope linkage so paid/failed/processing webhooks find the same operation without depending on a subscription id. Do not use autoTopupRebalance as a mislabeled threshold action; reuse compatible lower-level delta mechanics or a narrowly named settlement action.

Payment failures and 3DS-required outcomes block. An actual processing outcome stays allowed. Infrastructure errors/unknown outcomes remain reconcilable, not mislabeled card declines. Stop further charge creation while one scope has an unresolved operation.

## Step 6 — Additive, replay-safe settlement

On paid, pay down exactly 100 of overage; never assign remaining=0 or restore the included allowance. Example: -140 at claim, another 20 tracked during payment, paid result → -60. Persist only the net additive change against the original scope, without changing next_reset_at or the usage event history.

Use existing balance mutation/reset internals only where they support partial deltas; a cycle reset cannot implement this contract. Runtime CusEntService patches explicitly set incrementCacheVersion:false. DB lifecycle protection follows the existing cache-version rule, never a global bump.

The paid invoice can precede a failed balance write. Keep phase settling until the delta and operation marker have been applied exactly once, using the existing atomic publication/sync model where possible. Duplicate paid webhook, worker retry and process restart must converge on one delta.

## Step 7 — Payment blocking and recovery

Keep threshold failure state distinct from Stripe subscription status. Project blocked state into the owning customer product's cached evaluation data so check and positive deductions share one predicate. Do not depend on the organization overdue setting for threshold enforcement.

Rule: threshold failure blocks this plan unless product.config.ignore_past_due. Preserve existing ordinary overdue behavior and allow_overdue_entitlements semantics separately. Other paid plans, unrelated scopes, negative corrections and settlement writes remain usable. Invalidate/project state to customer and relevant entity caches on block/unblock.

Recover by paying the same invoice, including through its hosted payment page. Paid settlement clears this failure only; it must not clear another unpaid threshold invoice or an unrelated subscription overdue condition. Changing payment method alone does not forgive existing debt. Under ignore_past_due, usage continues but the failed operation still prevents duplicate charging.

## Step 8 — Renewal and lifecycle reconciliation

Audit `processConsumablePricesForInvoiceCreated`, subscription deletion billing, attach swap arrears, carry-over/reset paths and invoice previews. Completed threshold payments have already reduced billable overage; pending/failed invoices reserve their units so renewal bills only uninvoiced remainder. A 140-unit overage with a pending 100-unit invoice must never produce another 140-unit renewal charge.

Store operation cycle/source allocation. If the original cycle has reset or plan has ended before late payment, settle the old invoice without crediting the new cycle. Scheduled transitions, removal, plan version updates and multi-item billing cannot orphan unresolved operations. Retain failed obligation/access block according to the owning plan until payment resolution; do not auto-delete it on a timer.

Treat this step as required correctness, not a later enhancement. If existing renewal accounting cannot exclude reservations without a new field, add the narrow field on its owning balance/accounting representation and test the shared calculation once.

## Step 9 — Tests and release

Write pure tests first for eligibility, scope resolution, billing_units arithmetic, rate-window expiry, outcome mapping, and one-time delta application. Use synthetic customer fixtures.

Focused integration cases:

| Behavior | Expected |
|---|---|
| No setting / invalid setting | unchanged behavior / validation error |
| Catalog/variant/custom attach | effective setting round-trips |
| Preview / scheduled / deferred attach | no early charge |
| 99 → 100 / 140 overage | one invoice for 100 / 40 left after paid |
| 240 overage | separate 100-unit invoices, limiter respected |
| Suppressed attempt; no later track | delayed recheck eventually bills |
| 20 tracked while paying 100 from 140 | 60 left |
| Duplicate queue / worker crash / repeated webhook | one invoice and one delta |
| Processing / first failure | usage allowed / check and track blocked |
| ignore_past_due; org overdue toggle off | override works / threshold block still works |
| Dimensions / effective credit override / pooled / entities | correct units and owner; no cross-item mixing |
| Renewal with 100 pending from 140 | renewal bills only remaining 40 |
| Late payment after reset or swap | no new-cycle grant; no duplicate arrears |
| Redis/DB fallback and stale sync | cache parity; no lost accepted usage |

Run one named Stripe-backed case at a time with complete output saved under /tmp. Run broader relevant suites once after the focused cases pass, then typecheck and format touched files. Generate REST OpenAPI/client types from schemas; no dashboard work.

Release behind a narrowly scoped opt-in/rollout flag. Observe attempts, suppressed work, blocked scopes and unsettled operations using existing logging/metrics. Reconciliation and payment-success webhooks must continue working if new triggering is disabled.

## Implementation order

1. Schema + item conversions + validation tests.
2. State migration/repos + rate/claim unit tests.
3. Attach propagation tests and minimal conversion fixes.
4. Threshold billing compute/execution + pricing tests.
5. Replay-safe settlement + payment webhooks.
6. Cached blocking predicate + check/track tests.
7. Trigger + delayed retry scheduling.
8. Renewal/transition accounting + concurrency/payment integration tests.
9. REST artifacts, rollout and final focused verification.

Do not enable production triggering until steps 5–8 pass. No implementation is included in this plan.
