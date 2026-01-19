---
name: billing
description: Debug, edit, and fix billing endpoints. Covers legacy endpoints (attach/checkout/cancel) and the new v2 4-layer architecture (setup, compute, evaluate, execute). Use when working on billing, subscription, invoicing, or Stripe integration code.
---

# Billing Endpoints Guide

## When to Use This Skill

- Debugging billing issues (double charges, missing invoices, wrong subscription items)
- Adding new billing endpoints
- Understanding how Autumn state maps to Stripe
- Fixing subscription update/cancel/attach flows
- Working with subscription schedules (future changes)

## Endpoint Quick Reference

| Operation | Handler | Architecture | Notes |
|-----------|---------|--------------|-------|
| Attach product | `billing/attach/handleAttach.ts` | Legacy | Adds product to customer |
| Checkout | `billing/checkout/handleCheckoutV2.ts` | Legacy | Creates Stripe checkout session |
| Cancel | `customers/cancel/handleCancel.ts` | Legacy | Cancels subscription |
| **Update subscription** | `billing/v2/updateSubscription/handleUpdateSubscription.ts` | **V2** | Quantity/plan changes |

**All new billing endpoints MUST use V2 architecture.**

## V2 Architecture: The 4-Layer Pattern

Every V2 billing endpoint follows this exact pattern. Copy this template:

```typescript
// From: billing/v2/updateSubscription/handleUpdateSubscription.ts

export const handleUpdateSubscription = createRoute({
  body: UpdateSubscriptionV0ParamsSchema,
  handler: async (c) => {
    const ctx = c.get("ctx");
    const body = c.req.valid("json");

    // 1. SETUP - Fetch all context needed for billing operation
    const billingContext = await setupUpdateSubscriptionBillingContext({
      ctx,
      params: body,
    });
    logUpdateSubscriptionContext({ ctx, billingContext });

    // 2. COMPUTE - Determine Autumn state changes
    const autumnBillingPlan = await computeUpdateSubscriptionPlan({
      ctx,
      billingContext,
      params: body,
    });
    logUpdateSubscriptionPlan({ ctx, plan: autumnBillingPlan, billingContext });

    // 3. ERROR HANDLING - Validate before execution
    await handleUpdateSubscriptionErrors({
      ctx,
      billingContext,
      autumnBillingPlan,
      params: body,
    });

    // 4. EVALUATE - Map Autumn changes to Stripe changes (UNIFIED)
    const stripeBillingPlan = await evaluateStripeBillingPlan({
      ctx,
      billingContext,
      autumnBillingPlan,
    });
    logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

    // 5. EXECUTE - Run Stripe actions, then Autumn DB updates
    const billingResult = await executeBillingPlan({
      ctx,
      billingContext,
      billingPlan: {
        autumn: autumnBillingPlan,
        stripe: stripeBillingPlan,
      },
    });

    const response = billingResultToResponse({ billingContext, billingResult });
    return c.json(response, 200);
  },
});
```

**Key principle**: `evaluateStripeBillingPlan` and `executeBillingPlan` are UNIFIED across all endpoints. Rarely modify them.

**See [V2 Four-Layer Pattern Deep Dive](./references/v2-four-layer-pattern.md) for detailed explanation.**

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

**Test reference**: `tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts`

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

**See [Common Bugs Reference](./references/common-bugs.md) for detailed debugging steps.**

## Adding a New Billing Endpoint

1. **Create setup function**: `setup/setupXxxBillingContext.ts`
   - Extend `BillingContext` interface if needed
   - Fetch customer, products, Stripe state, timestamps

2. **Create compute function**: `compute/computeXxxPlan.ts`
   - Return `AutumnBillingPlan` with insertCustomerProducts, deleteCustomerProduct, lineItems

3. **Create error handler**: `errors/handleXxxErrors.ts`
   - Validate before execution

4. **Wire up handler**: `handleXxx.ts`
   - Use the 4-layer template above

5. **DO NOT modify** `evaluateStripeBillingPlan` or `executeBillingPlan` unless absolutely necessary

**See [V2 Four-Layer Pattern](./references/v2-four-layer-pattern.md) for detailed guidance.**

## Invoicing Utilities (Pure Calculations)

The `shared/utils/billingUtils/` folder contains **pure calculation functions** that determine what customers are charged. These are the foundation of all billing operations.

**Key utilities**:

| Function | Location | Purpose |
|----------|----------|---------|
| `priceToLineAmount` | `invoicingUtils/lineItemUtils/` | Calculate charge amount for a price |
| `tiersToLineAmount` | `invoicingUtils/lineItemUtils/` | Calculate tiered/usage-based amounts |
| `applyProration` | `invoicingUtils/prorationUtils/` | Calculate partial period charges |
| `buildLineItem` | `invoicingUtils/lineItemBuilders/` | Core line item builder |
| `fixedPriceToLineItem` | `invoicingUtils/lineItemBuilders/` | Build line item for fixed prices |
| `usagePriceToLineItem` | `invoicingUtils/lineItemBuilders/` | Build line item for usage prices |
| `getCycleEnd` | `cycleUtils/` | Calculate billing cycle end |
| `getCycleStart` | `cycleUtils/` | Calculate billing cycle start |

**Key concepts**:
- `LineItem.amount` is positive for charges, negative for refunds
- `context.direction` controls the sign (`"charge"` vs `"refund"`)
- Proration is applied automatically when `billingPeriod` is provided
- Consumable prices don't prorate (usage is charged as-is)

**See [Invoicing Utilities Reference](./references/invoicing-utilities.md) for detailed documentation.**

## Key File Locations

### V2 Billing (`server/src/internal/billing/v2/`)

| Layer | Key Files |
|-------|-----------|
| **Setup** | `setup/setupFullCustomerContext.ts`, `setup/setupTrialContext.ts`, `providers/stripe/setup/setupStripeBillingContext.ts` |
| **Compute** | `updateSubscription/compute/computeUpdateSubscriptionPlan.ts`, `compute/computeAutumnUtils/buildAutumnLineItems.ts` |
| **Evaluate** | `providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts`, `providers/stripe/actionBuilders/buildStripeSubscriptionAction.ts` |
| **Execute** | `execute/executeBillingPlan.ts`, `providers/stripe/execute/executeStripeBillingPlan.ts` |

### Stripe Mapping Utilities

| Purpose | File |
|---------|------|
| Customer product → Stripe item specs | `providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs.ts` |
| Build subscription items update | `providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate.ts` |
| Build schedule phases | `providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate.ts` |
| Build transition points | `providers/stripe/utils/subscriptionSchedules/buildTransitionPoints.ts` |
| Check if Stripe creates invoice | `providers/stripe/utils/invoices/shouldCreateManualStripeInvoice.ts` |

### Types

| Type | Location | Purpose |
|------|----------|---------|
| `BillingContext` | `billingContext.ts` | Customer, products, Stripe state, timestamps |
| `AutumnBillingPlan` | `types/autumnBillingPlan.ts` | Autumn state changes (inserts, deletes, line items) |
| `StripeBillingPlan` | `types/stripeBillingPlan/stripeBillingPlan.ts` | Stripe actions (subscription, invoice, schedule) |

### Invoicing Utilities (`shared/utils/billingUtils/`)

| Purpose | File |
|---------|------|
| Amount calculations | `invoicingUtils/lineItemUtils/priceToLineAmount.ts`, `tiersToLineAmount.ts` |
| Line item builders | `invoicingUtils/lineItemBuilders/buildLineItem.ts`, `fixedPriceToLineItem.ts`, `usagePriceToLineItem.ts` |
| Proration | `invoicingUtils/prorationUtils/applyProration.ts` |
| Billing cycles | `cycleUtils/getCycleEnd.ts`, `getCycleStart.ts` |

### Tests

| What | Location |
|------|----------|
| Schedule phases | `tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts` |

## Reference Files

Load these on-demand for detailed information:

- [V2 Four-Layer Pattern](./references/v2-four-layer-pattern.md) - Deep dive on each layer
- [Stripe Subscription Items](./references/stripe-subscription-items.md) - Immediate changes mapping
- [Stripe Schedule Phases](./references/stripe-schedule-phases.md) - Future changes mapping
- [Stripe Invoice Rules](./references/stripe-invoice-rules.md) - Invoice decision tree
- [Invoicing Utilities](./references/invoicing-utilities.md) - Pure calculation functions for charges
- [Common Bugs](./references/common-bugs.md) - Debugging guide with solutions
