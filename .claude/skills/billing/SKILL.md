---
name: billing
description: Debug, edit, and fix billing operations. Covers the V2 action-based architecture (attach, multiAttach, updateSubscription, allocatedInvoice, createWithDefaults, setupPayment). Use when working on billing, subscription, invoicing, or Stripe integration code.
---

# Billing Operations Guide

## When to Use This Skill

- Debugging billing issues (double charges, missing invoices, wrong subscription items)
- Adding new billing actions
- Understanding how Autumn state maps to Stripe
- Fixing subscription update/cancel/attach flows
- Working with subscription schedules (future changes)
- Understanding allocated invoice (mid-cycle usage-based invoicing)

## V2 Billing Actions

All billing logic is orchestrated through **`billingActions`** (`billing/v2/actions/index.ts`). Handlers are thin — they call an action, then format the response.

```typescript
// billing/v2/actions/index.ts
export const billingActions = {
  attach,              // Single product attach
  multiAttach,         // Attach multiple products atomically
  setupPayment,        // Setup payment method (+ optional plan validation)
  updateSubscription,  // Update quantity, cancel, uncancel, custom plan
  migrate,             // Programmatic product migration (not HTTP-exposed)

  legacy: {            // V1→V2 bridge adapters (backward compat)
    attach: legacyAttach,
    updateQuantity,
    renew,
  },
} as const;
```

Two additional billing operations live outside `billingActions` but use the same evaluate+execute pipeline:
- **`createAllocatedInvoice`** — mid-cycle invoicing triggered by balance deduction
- **`createCustomerWithDefaults`** — customer creation with default products

### Action Quick Reference

| Action | Trigger | What It Does |
|--------|---------|--------------|
| `attach` | HTTP `billing.attach` | Add/upgrade/downgrade a single product. Handles transitions, prorations, trials, checkout mode |
| `multiAttach` | HTTP `billing.multi_attach` | Attach multiple products atomically. At most one transition allowed |
| `updateSubscription` | HTTP `billing.update` | Change quantity, cancel (immediate/end-of-cycle), uncancel, update custom plan items |
| `setupPayment` | HTTP `billing.setup_payment` | Create Stripe setup checkout. Optionally validates a plan via preview first |
| `createAllocatedInvoice` | Programmatic (balance deduction) | Invoice for allocated usage changes (prepaid overages, usage upgrades/downgrades) |
| `createCustomerWithDefaults` | Programmatic (customer creation) | Two-phase: create customer + products in DB, then create Stripe subscription for paid defaults |

Each HTTP action also has a **preview** variant (`billing.preview_attach`, `billing.preview_multi_attach`, `billing.preview_update`) that runs setup+compute+evaluate but skips execution.

The **legacy V1 attach** (`POST /attach`) still exists and delegates to `billingActions.legacy.attach`, which converts old `AttachParams` format into V2 billing context overrides. Similarly `legacyUpdateQuantity` and `legacyRenew` bridge old flows to V2.

### Handler Pattern

Handlers are thin wrappers — they parse params, call the action, format response:

```typescript
// billing/v2/handlers/handleAttachV2.ts
export const handleAttachV2 = createRoute({
  versionedBody: { latest: AttachParamsV1Schema, [ApiVersion.V1_Beta]: AttachParamsV0Schema },
  resource: AffectedResource.Attach,
  lock: { /* distributed lock per customer */ },
  handler: async (c) => {
    const ctx = c.get("ctx");
    const body = c.req.valid("json");

    const { billingContext, billingResult } = await billingActions.attach({
      ctx,
      params: body,
      preview: false,
    });

    return c.json(billingResultToResponse({ billingContext, billingResult }), 200);
  },
});
```

## The 4-Layer Pattern (Inside Each Action)

Every action follows: **Setup → Compute → Evaluate → Execute**

```typescript
// billing/v2/actions/attach/attach.ts (simplified)
export async function attach({ ctx, params, preview }) {
  // 1. SETUP — Fetch all context (customer, Stripe, products, trial, cycle anchors)
  const billingContext = await setupAttachBillingContext({ ctx, params });

  // 2. COMPUTE — Determine Autumn state changes (new products, transitions, line items)
  const autumnBillingPlan = computeAttachPlan({ ctx, attachBillingContext: billingContext, params });

  // 3. EVALUATE — Map Autumn changes → Stripe actions (UNIFIED across all actions)
  const stripeBillingPlan = await evaluateStripeBillingPlan({ ctx, billingContext, autumnBillingPlan });

  // 4. ERRORS — Validate before execution
  handleAttachV2Errors({ ctx, billingContext, billingPlan, params });

  if (preview) return { billingContext, billingPlan };

  // 5. EXECUTE — Run Stripe first, then Autumn DB (UNIFIED across all actions)
  const billingResult = await executeBillingPlan({ ctx, billingContext, billingPlan });
  return { billingContext, billingPlan, billingResult };
}
```

**Key principle**: `evaluateStripeBillingPlan` and `executeBillingPlan` are **UNIFIED** across all actions. Only modify them when adding new Stripe action types.

**See [V2 Four-Layer Pattern Deep Dive](./references/v2-four-layer-pattern.md) for detailed explanation.**

## Allocated Invoice

**Not an HTTP endpoint** — triggered during `executePostgresDeduction` when allocated (prepaid) usage changes.

**File**: `server/src/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.ts`

**When it fires**: A customer with usage-based allocated pricing (e.g., prepaid seats) has their usage change. The system needs to invoice for the delta.

**Flow**:
1. **Setup** (`setupAllocatedInvoiceContext`) — re-fetches full customer, computes previous/new usage and overage from entitlement snapshots
2. **Compute** (`computeAllocatedInvoicePlan`) — builds refund line item for previous usage + charge line item for new usage. Handles upgrade (delete replaceables) and downgrade (create replaceables) scenarios
3. **Evaluate + Execute** — standard unified pipeline (`evaluateStripeBillingPlan` → `executeBillingPlan`)
4. **Post-execute** — if Stripe invoice payment fails, voids invoice and throws `PayInvoiceFailed`
5. **Mutation** — calls `refreshDeductionUpdate` to mutate the deduction update with replaceable and balance changes

**Key difference from other actions**: Produces only `updateCustomerEntitlements` + `lineItems` (no `insertCustomerProducts`). The AutumnBillingPlan is minimal since the customer product already exists.

## Two Critical Stripe Mappings

Getting billing right means getting these two mappings right:

### 1. Subscription Items (Immediate Changes)

**When**: Updating a subscription right now (add/remove/change items immediately)

**Key function**: `buildStripeSubscriptionItemsUpdate`

**Flow**:
```
FullCusProduct[] 
  → filter by subscription ID
  → filter by active statuses  
  → customerProductToStripeItemSpecs() 
  → diff against current subscription
  → Stripe.SubscriptionUpdateParams.Item[]
```

**See [Stripe Subscription Items Reference](./references/stripe-subscription-items.md) for details.**

### 2. Schedule Phases (Future Changes)

**When**: Scheduling changes for the future (downgrades at cycle end, scheduled cancellations)

**Key function**: `buildStripePhasesUpdate`

**Flow**:
```
FullCusProduct[]
  → normalize timestamps to seconds
  → buildTransitionPoints() (find all start/end times)
  → for each period: filter active products
  → customerProductsToPhaseItems()
  → Stripe.SubscriptionScheduleUpdateParams.Phase[]
```

**See [Stripe Schedule Phases Reference](./references/stripe-schedule-phases.md) for details.**

## Stripe Invoice Decision Tree

**Critical**: Stripe sometimes forces invoice creation. If you also create a manual invoice, customer gets double-charged.

```
Does Stripe force-create an invoice?
├── Creating a new subscription? 
│   └── YES → Stripe creates invoice. DO NOT create manual invoice.
│
├── Removing trial from subscription? (isTrialing && !willBeTrialing)
│   └── YES → Stripe creates invoice. DO NOT create manual invoice.
│
└── Otherwise
    └── NO → We create manual invoice using buildStripeInvoiceAction()
```

**Key functions**:
- `shouldCreateManualStripeInvoice()` - Returns true if WE should create invoice
- `willStripeSubscriptionUpdateCreateInvoice()` - Returns true if STRIPE will create invoice

**See [Stripe Invoice Rules Reference](./references/stripe-invoice-rules.md) for full decision tree.**

## Common Issues & Fixes

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Double invoice charge | Created manual invoice when Stripe already did | Check `shouldCreateManualStripeInvoice()` |
| Subscription items wrong | `customerProductToStripeItemSpecs` output incorrect | Debug spec generation, check quantity rules |
| Schedule phases wrong | Transition points incorrect | Check `buildTransitionPoints`, run schedule phases tests |
| Trial not ending | `trialContext` not set up correctly | Check `setupTrialContext` |
| Quantities wrong | Metered vs licensed confusion | `undefined` = metered, `0` = entity placeholder, `N` = licensed |
| Allocated invoice fails | Stripe payment failed for usage delta | Invoice is voided, `PayInvoiceFailed` thrown |

**See [Common Bugs Reference](./references/common-bugs.md) for detailed debugging steps.**

## Adding a New Billing Action

1. **Create action function**: `billing/v2/actions/myAction/myAction.ts`
   - Follow the attach.ts pattern: setup → compute → evaluate → errors → execute
   - Return `{ billingContext, billingPlan, billingResult }`

2. **Create setup function**: `billing/v2/actions/myAction/setup/setupMyActionBillingContext.ts`
   - Extend `BillingContext` interface if needed
   - Use shared setup functions (`setupFullCustomerContext`, `setupStripeBillingContext`, etc.)

3. **Create compute function**: `billing/v2/actions/myAction/compute/computeMyActionPlan.ts`
   - Return `AutumnBillingPlan` with insertCustomerProducts, lineItems, etc.

4. **Create error handler**: `billing/v2/actions/myAction/errors/handleMyActionErrors.ts`

5. **Register in `billingActions`**: `billing/v2/actions/index.ts`

6. **Create handler** (if HTTP-exposed): `billing/v2/handlers/handleMyAction.ts`
   - Thin wrapper calling `billingActions.myAction()`

7. **DO NOT modify** `evaluateStripeBillingPlan` or `executeBillingPlan` unless absolutely necessary

## Invoicing Utilities (Pure Calculations)

The `shared/utils/billingUtils/` folder contains **pure calculation functions** that determine what customers are charged.

**Key utilities**:

| Function | Location | Purpose |
|----------|----------|---------|
| `priceToLineAmount` | `invoicingUtils/lineItemUtils/` | Calculate charge amount for a price |
| `tiersToLineAmount` | `invoicingUtils/lineItemUtils/` | Calculate tiered/usage-based amounts |
| `applyProration` | `invoicingUtils/prorationUtils/` | Calculate partial period charges |
| `buildLineItem` | `invoicingUtils/lineItemBuilders/` | Core line item builder |
| `fixedPriceToLineItem` | `invoicingUtils/lineItemBuilders/` | Build line item for fixed prices |
| `usagePriceToLineItem` | `invoicingUtils/lineItemBuilders/` | Build line item for usage prices |

**Key concepts**:
- `LineItem.amount` is positive for charges, negative for refunds
- `context.direction` controls the sign (`"charge"` vs `"refund"`)
- Proration is applied automatically when `billingPeriod` is provided
- Consumable prices don't prorate (usage is charged as-is)

**See [Invoicing Utilities Reference](./references/invoicing-utilities.md) for detailed documentation.**

## Key File Locations

### V2 Actions (`server/src/internal/billing/v2/actions/`)

| Action | Key Files |
|--------|-----------|
| **attach** | `attach/attach.ts`, `attach/setup/setupAttachBillingContext.ts`, `attach/compute/computeAttachPlan.ts` |
| **multiAttach** | `multiAttach/multiAttach.ts`, `multiAttach/setup/`, `multiAttach/compute/` |
| **updateSubscription** | `updateSubscription/updateSubscription.ts`, `updateSubscription/compute/` (cancel/, customPlan/, updateQuantity/) |
| **setupPayment** | `setupPayment/setupPayment.ts` |

### Shared V2 Infrastructure (`server/src/internal/billing/v2/`)

| Layer | Key Files |
|-------|-----------|
| **Evaluate** | `providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts` |
| **Execute** | `execute/executeBillingPlan.ts`, `execute/executeAutumnBillingPlan.ts` |
| **Shared Setup** | `setup/setupFullCustomerContext.ts`, `setup/setupBillingCycleAnchor.ts`, `providers/stripe/setup/setupStripeBillingContext.ts` |
| **Shared Compute** | `compute/computeAutumnUtils/buildAutumnLineItems.ts`, `compute/finalize/finalizeLineItems.ts` |

### Non-billingActions Operations

| Operation | Key Files |
|-----------|-----------|
| **allocatedInvoice** | `server/src/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.ts`, `compute/computeAllocatedInvoicePlan.ts` |
| **createWithDefaults** | `server/src/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.ts` |

### Types

| Type | Location | Purpose |
|------|----------|---------|
| `BillingContext` | `shared/models/billingModels/context/billingContext.ts` | Customer, products, Stripe state, timestamps |
| `AutumnBillingPlan` | `shared/models/billingModels/plan/autumnBillingPlan.ts` | Autumn state changes (inserts, deletes, line items) |
| `StripeBillingPlan` | Types in `billing/v2/providers/stripe/` | Stripe actions (subscription, invoice, schedule) |

## Reference Files

Load these on-demand for detailed information:

- [V2 Four-Layer Pattern](./references/v2-four-layer-pattern.md) - Deep dive on each layer
- [Stripe Subscription Items](./references/stripe-subscription-items.md) - Immediate changes mapping
- [Stripe Schedule Phases](./references/stripe-schedule-phases.md) - Future changes mapping
- [Stripe Invoice Rules](./references/stripe-invoice-rules.md) - Invoice decision tree
- [Invoicing Utilities](./references/invoicing-utilities.md) - Pure calculation functions for charges
- [Common Bugs](./references/common-bugs.md) - Debugging guide with solutions
