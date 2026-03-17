# Common Billing Bugs & Debugging Guide

This document covers common billing issues, their causes, and how to debug them.

## Quick Reference Table

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Double invoice charge | Created manual invoice when Stripe already did | Check `shouldCreateManualStripeInvoice()` |
| Customer not charged | Didn't create manual invoice when needed | Check `shouldCreateManualStripeInvoice()` |
| Subscription items wrong | `customerProductToStripeItemSpecs` output incorrect | Debug spec generation |
| Schedule phases wrong | Transition points incorrect | Check `buildTransitionPoints`, run tests |
| Trial not ending | `trialContext` not set up correctly | Check `setupTrialContext` |
| Quantities wrong | Metered vs licensed confusion | Check quantity rules |
| Missing products in phase | `isCustomerProductActiveDuringPeriod` filtering wrong | Check timestamps |

## Issue 1: Double Invoice Charge

### Symptom
Customer is charged twice for the same subscription change.

### Root Cause
Created a manual Stripe invoice when Stripe was already creating one automatically.

### When Does This Happen?

Stripe automatically creates invoices when:
1. Creating a new subscription
2. Removing a trial from a subscription

### Debug Steps

1. **Check the subscription action type**:
   ```typescript
   console.log("Subscription action:", stripeSubscriptionAction?.type);
   // If "create" → Stripe creates invoice
   ```

2. **Check trial state transition**:
   ```typescript
   const { isTrialing, willBeTrialing } = getTrialStateTransition({ billingContext });
   console.log("Trial state:", { isTrialing, willBeTrialing });
   // If isTrialing && !willBeTrialing → Stripe creates invoice
   ```

3. **Check shouldCreateManualStripeInvoice result**:
   ```typescript
   const shouldCreate = shouldCreateManualStripeInvoice({ billingContext, stripeSubscriptionAction });
   console.log("Should create manual invoice:", shouldCreate);
   // Should be false for create or trial removal
   ```

### Fix
Ensure `shouldCreateManualStripeInvoice` returns `false` for subscription creation and trial removal.

---

## Issue 2: Subscription Items Wrong

### Symptom
Stripe subscription has wrong items, wrong quantities, or missing items.

### Root Cause
`customerProductToStripeItemSpecs` is producing incorrect output, or the diff logic is wrong.

### Debug Steps

1. **Log the customer products being processed**:
   ```typescript
   console.log("Customer products:", finalCustomerProducts.map(cp => ({
     id: cp.id,
     product: cp.product.id,
     status: cp.status,
     stripe_subscription_id: cp.stripe_subscription_id,
   })));
   ```

2. **Check filtering**:
   ```typescript
   // After filterCustomerProductsByStripeSubscriptionId
   console.log("After subscription filter:", relatedCustomerProducts.length);
   
   // After filterCustomerProductsByActiveStatuses
   console.log("After status filter:", activeCustomerProducts.length);
   ```

3. **Log the StripeItemSpecs**:
   ```typescript
   const { recurringItems, oneOffItems } = customerProductToStripeItemSpecs({ ctx, customerProduct, billingContext });
   console.log("Recurring items:", recurringItems);
   console.log("One-off items:", oneOffItems);
   ```

4. **Check quantity source**:
   - For prepaid: `customerProduct.options[]`
   - For allocated: `cusEntToInvoiceUsage()`
   - For fixed: Always `1`
   - For metered: Always `undefined`

### Quantity Rules Reference

| Price Type | Expected Quantity | Source |
|------------|-------------------|--------|
| Fixed (`FixedCycle`) | `1` | Hardcoded |
| Prepaid (`UsageInAdvance`) | `N` (seats) | `customerProduct.options[].quantity` |
| Consumable (`UsageInArrear`) | `undefined` | Metered price |
| Consumable (Entity) | `0` | Placeholder |
| Allocated (`InArrearProrated`) | `usage` | `allowance - balance` |

### Fix
- Verify customer product has correct `options[]` for prepaid prices
- Verify price has `stripe_price_id` set
- Verify customer product has correct `stripe_subscription_id`

---

## Issue 3: Schedule Phases Wrong

### Symptom
Subscription schedule has wrong phases, wrong phase boundaries, or wrong items in phases.

### Root Cause
Transition points are calculated incorrectly, or products are incorrectly filtered for phases.

### Debug Steps

1. **Run the schedule phases tests**:
   ```bash
   bun test server/tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts
   ```

2. **Log transition points**:
   ```typescript
   logTransitionPoints({ ctx, customerProducts, transitionPoints, nowMs });
   ```

3. **Check customer product timestamps**:
   ```typescript
   console.log("Customer products:", customerProducts.map(cp => ({
     id: cp.id,
     product: cp.product.id,
     status: cp.status,
     starts_at: new Date(cp.starts_at).toISOString(),
     ended_at: cp.ended_at ? new Date(cp.ended_at).toISOString() : null,
   })));
   ```

4. **Check millisecond normalization**:
   ```typescript
   // Timestamps should be truncated to second precision
   console.log("Now (ms):", nowMs);
   console.log("Now (normalized):", truncateMsToSecondPrecision(nowMs));
   ```

5. **Log each phase**:
   ```typescript
   logPhase({ ctx, phase, customerProducts: activeCustomerProducts, phaseIndex });
   ```

### Common Mistakes

1. **Millisecond differences creating spurious phases**:
   - Product A ends at `1704067200100` (100ms)
   - Product B starts at `1704067200600` (600ms)
   - Same second, but creates 2 transition points if not normalized

2. **Product not active in expected phase**:
   - Check `isCustomerProductActiveDuringPeriod` logic
   - Verify `starts_at` < phase `endMs`
   - Verify `ended_at` > phase `startMs` or is null

3. **Scheduled product not creating transition**:
   - Check product status is `CusProductStatus.Scheduled`
   - Check `starts_at` is in the future (`> nowMs`)

### Fix
- Ensure timestamps are normalized via `truncateMsToSecondPrecision`
- Verify customer product `starts_at` and `ended_at` are correct
- Verify product statuses are correct (`Active`, `Scheduled`)

---

## Issue 4: Trial Not Ending

### Symptom
Customer's trial should have ended, but subscription is still in trial.

### Root Cause
`trialContext` is not set up correctly, or trial end is not being applied to subscription.

### Debug Steps

1. **Check trialContext setup**:
   ```typescript
   console.log("Trial context:", billingContext.trialContext);
   // Should have trialEndsAt if trial is ending
   ```

2. **Check setupTrialContext inputs**:
   ```typescript
   console.log("Stripe subscription status:", stripeSubscription?.status);
   console.log("Stripe trial_end:", stripeSubscription?.trial_end);
   console.log("Customer product free trial:", customerProduct.free_trial);
   ```

3. **Check trial state transition**:
   ```typescript
   const { isTrialing, willBeTrialing } = getTrialStateTransition({ billingContext });
   console.log("Trial transition:", { isTrialing, willBeTrialing });
   ```

4. **Check subscription update params**:
   ```typescript
   console.log("Subscription update params:", stripeSubscriptionAction?.params);
   // Should have trial_end: "now" if removing trial
   ```

### Fix
- Verify `setupTrialContext` is called with correct inputs
- Verify `params.end_trial` is set if trial should end
- Verify subscription update includes `trial_end: "now"`

---

## Issue 5: Quantities Wrong

### Symptom
Subscription items have wrong quantities (wrong number of seats, etc.)

### Root Cause
Confusion between metered and licensed prices, or wrong options lookup.

### Debug Steps

1. **Identify the price type**:
   ```typescript
   console.log("Price billing type:", price.config?.billing_type);
   // UsageInArrear = metered (undefined quantity)
   // UsageInAdvance = prepaid (quantity from options)
   // FixedCycle = fixed (quantity = 1)
   ```

2. **Check options for prepaid prices**:
   ```typescript
   console.log("Customer product options:", customerProduct.options);
   const options = entToOptions({ ent, options: customerProduct.options ?? [] });
   console.log("Options for entitlement:", options);
   ```

3. **Check quantity in StripeItemSpec**:
   ```typescript
   console.log("StripeItemSpec:", {
     stripePriceId: item.stripePriceId,
     quantity: item.quantity, // undefined = metered, 0 = entity, N = licensed
   });
   ```

### Quantity Distinction

- **`undefined`**: Metered price - Stripe manages usage reporting
- **`0`**: Entity-linked consumable - placeholder on subscription
- **`1`**: Fixed price - one unit
- **`N`**: Licensed price - N seats/units

### Fix
- For prepaid prices: Ensure `customerProduct.options[]` has correct quantity
- For metered prices: Ensure quantity is `undefined`, not `0` or `1`
- For entity prices: Ensure using `stripe_empty_price_id` with quantity `0`

---

## Issue 6: Missing Products in Phase

### Symptom
A customer product that should be active during a phase is not included.

### Root Cause
`isCustomerProductActiveDuringPeriod` is filtering it out incorrectly.

### Debug Steps

1. **Log the filter logic**:
   ```typescript
   const isActive = isCustomerProductActiveDuringPeriod({
     customerProduct,
     startMs,
     endMs,
   });
   console.log("Product active check:", {
     productId: customerProduct.product.id,
     productStartsAt: customerProduct.starts_at,
     productEndedAt: customerProduct.ended_at,
     phaseStartMs: startMs,
     phaseEndMs: endMs,
     isActive,
   });
   ```

2. **Check the filter conditions**:
   - Product starts before phase ends: `productStartsAt < endMs`
   - Product ends after phase starts: `productEndedAt > startMs` (or is null)

### Fix
- Verify customer product timestamps are correct
- Verify product is not set to end before phase starts
- Verify product is not set to start after phase ends

---

## Debugging Tips

### Enable Logging

The billing code has built-in logging functions:

```typescript
// Log context
logUpdateSubscriptionContext({ ctx, billingContext });

// Log Autumn plan
logUpdateSubscriptionPlan({ ctx, plan: autumnBillingPlan, billingContext });

// Log Stripe plan
logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

// Log Stripe result
logStripeBillingResult({ ctx, result: billingResult.stripe });

// Log transition points
logTransitionPoints({ ctx, customerProducts, transitionPoints, nowMs });

// Log phase
logPhase({ ctx, phase, customerProducts, phaseIndex, logPrefix, showCustomerProducts: true });
```

### Check Stripe Dashboard

After execution, verify in Stripe dashboard:
- Subscription items match expected
- Subscription schedule phases match expected
- Invoices are created correctly

### Run Tests

```bash
# Schedule phases tests
bun test server/tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts

# Other billing tests
bun test server/tests/unit/billing/
```

---

## Key Files for Debugging

| Area | File |
|------|------|
| Subscription items | `providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate.ts` |
| Item specs | `providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs.ts` |
| Schedule phases | `providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate.ts` |
| Transition points | `providers/stripe/utils/subscriptionSchedules/buildTransitionPoints.ts` |
| Invoice rules | `providers/stripe/utils/invoices/shouldCreateManualStripeInvoice.ts` |
| Trial logic | `setup/setupTrialContext.ts` |
| Line items | `compute/computeAutumnUtils/buildAutumnLineItems.ts` |
