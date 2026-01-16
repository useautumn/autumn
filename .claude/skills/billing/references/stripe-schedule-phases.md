# Stripe Schedule Phases Mapping

This document explains how Autumn maps customer products to Stripe subscription schedule phases for **future** subscription changes.

## Overview

When scheduling changes for the future (downgrades at cycle end, scheduled cancellations, add-on removals), we need to build a sequence of phases that describe what the subscription should look like at each point in time.

**Key function**: `buildStripePhasesUpdate`

**Location**: `billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate.ts`

**Test file**: `tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts`

## Core Concept: Transition Points

A **transition point** is a timestamp where the subscription state changes:

- A product starts (`customerProduct.starts_at`)
- A product ends (`customerProduct.ended_at`)
- A trial ends (`trialEndsAt`)
- Billing cycle anchor changes (`newBillingCycleAnchorMs`)

Each transition point creates a new phase in the schedule.

## Pipeline

```
FullCusProduct[]
    ↓
normalizeCustomerProductTimestamps()
    ↓  Truncate to second precision (Stripe uses seconds)
buildTransitionPoints()
    ↓  Find all start/end timestamps
For each period between transition points:
    ↓
    isCustomerProductActiveDuringPeriod()
    ↓  Filter products active in this period
    customerProductsToPhaseItems()
    ↓  Convert to phase items, merge quantities
Stripe.SubscriptionScheduleUpdateParams.Phase[]
```

## Step 1: Normalize Timestamps

Stripe uses seconds, Autumn uses milliseconds. Normalize all timestamps:

```typescript
const normalizeCustomerProductTimestamps = (
  customerProduct: FullCusProduct,
): FullCusProduct => ({
  ...customerProduct,
  starts_at: truncateMsToSecondPrecision(customerProduct.starts_at),
  ended_at: customerProduct.ended_at
    ? truncateMsToSecondPrecision(customerProduct.ended_at)
    : undefined,
});
```

**Important**: This prevents edge cases where millisecond differences create spurious phases.

## Step 2: Build Transition Points

Collect all timestamps where subscription state changes:

```typescript
// From: buildTransitionPoints.ts

export const buildTransitionPoints = ({
  customerProducts,
  nowMs,
  trialEndsAt,
  newBillingCycleAnchorMs,
}: { ... }): (number | undefined)[] => {
  const timestamps = new Set<number>();

  // Add billing cycle anchor if in future
  if (newBillingCycleAnchorMs && newBillingCycleAnchorMs > nowMs) {
    timestamps.add(newBillingCycleAnchorMs);
  }

  for (const customerProduct of customerProducts) {
    // Scheduled products: future start = transition
    if (customerProduct.status === CusProductStatus.Scheduled && startsAtMs > nowMs) {
      timestamps.add(startsAtMs);
    }

    // Both Active and Scheduled: future end = transition (cancellation)
    if (endedAtMs && endedAtMs > nowMs) {
      timestamps.add(endedAtMs);
    }
  }

  // Add trial end only if schedule is required (other transitions exist)
  if (trialEndsAt && trialEndsAt > nowMs && timestamps.size > 0) {
    timestamps.add(trialEndsAt);
  }

  // Sort and add undefined for "infinity" (final phase has no end)
  return [...Array.from(timestamps).sort((a, b) => a - b), undefined];
};
```

## Step 3: Build Phases

For each period between transition points, determine which products are active:

```typescript
export const buildStripePhasesUpdate = ({
  ctx,
  billingContext,
  customerProducts,
  trialEndsAt,
}: { ... }): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
  const nowMs = truncateMsToSecondPrecision(billingContext.currentEpochMs);
  const normalizedCustomerProducts = customerProducts.map(normalizeCustomerProductTimestamps);

  const transitionPoints = buildTransitionPoints({
    customerProducts: normalizedCustomerProducts,
    nowMs,
    trialEndsAt: normalizedTrialEndsAt,
  });

  let startMs = nowMs;
  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];

  for (let i = 0; i < transitionPoints.length; i++) {
    const endMs = transitionPoints[i];

    // 1. Filter products active during this period
    const activeCustomerProducts = normalizedCustomerProducts.filter(
      (customerProduct) =>
        isCustomerProductActiveDuringPeriod({ customerProduct, startMs, endMs }),
    );

    // 2. Convert to phase items
    const phaseItems = customerProductsToPhaseItems({
      ctx,
      billingContext,
      customerProducts: activeCustomerProducts,
    });

    // 3. Compute trial_end for this phase
    const phaseTrialEnd = computePhaseTrialEndsAt();

    const phase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
      items: phaseItems,
      start_date: msToSeconds(startMs),
      end_date: endMs ? msToSeconds(endMs) : undefined,
      trial_end: phaseTrialEnd,
    };

    phases.push(phase);
    
    if (endMs) {
      startMs = endMs;
    }
  }

  return phases;
};
```

## Phase Structure

Each phase contains:

```typescript
{
  items: [{ price, quantity? }],  // What's active during this phase
  start_date: number,             // Phase start (Unix seconds)
  end_date?: number,              // Phase end (undefined = indefinite)
  trial_end?: number,             // Trial end if applicable
}
```

## Test Scenarios

The test file `build-schedule-phases.spec.ts` covers these scenarios:

### 1. Single Product - No Transition

```
Customer Products:
  - Premium: starts_at=now, ended_at=null (active indefinitely)

Transition Points: [undefined]

Phases:
  1. Phase 1: now → ∞
     Items: Premium prices
```

### 2. Premium → Pro Downgrade (in 1 month)

```
Customer Products:
  - Premium: starts_at=now, ended_at=30 days (Active)
  - Pro: starts_at=30 days, ended_at=null (Scheduled)

Transition Points: [30 days, undefined]

Phases:
  1. Phase 1: now → 30 days
     Items: Premium prices
  
  2. Phase 2: 30 days → ∞
     Items: Pro prices
```

### 3. Premium + Add-on → Pro + Add-on (main product changes, add-on stays)

```
Customer Products:
  - Premium: starts_at=now, ended_at=30 days (Active)
  - Pro: starts_at=30 days, ended_at=null (Scheduled)
  - Add-on: starts_at=now, ended_at=null (Active - persists)

Transition Points: [30 days, undefined]

Phases:
  1. Phase 1: now → 30 days
     Items: Premium + Add-on prices
  
  2. Phase 2: 30 days → ∞
     Items: Pro + Add-on prices
```

### 4. Product Cancellation (Premium → empty)

```
Customer Products:
  - Premium: starts_at=now, ended_at=30 days (Active, scheduled to cancel)

Transition Points: [30 days, undefined]

Phases:
  1. Phase 1: now → 30 days
     Items: Premium prices
  
  2. Phase 2: 30 days → ∞
     Items: [] (empty - subscription cancels)
```

### 5. Add-on Cancellation (Premium + Add-on → Premium)

```
Customer Products:
  - Premium: starts_at=now, ended_at=null (Active - persists)
  - Add-on: starts_at=now, ended_at=30 days (Active, scheduled to cancel)

Transition Points: [30 days, undefined]

Phases:
  1. Phase 1: now → 30 days
     Items: Premium + Add-on prices
  
  2. Phase 2: 30 days → ∞
     Items: Premium prices only
```

### 6. Millisecond Tolerance

Products with sub-second timing differences should collapse to the same transition:

```
Customer Products:
  - Pro: ends at transitionSecond + 100ms
  - Premium: starts at transitionSecond + 600ms

Result: 2 phases (NOT 3!), because ms differences are truncated to seconds
```

## isCustomerProductActiveDuringPeriod

Determines if a customer product is active during a given time period:

```typescript
export const isCustomerProductActiveDuringPeriod = ({
  customerProduct,
  startMs,
  endMs,
}: {
  customerProduct: FullCusProduct;
  startMs: number;
  endMs?: number;
}): boolean => {
  const productStartsAt = customerProduct.starts_at;
  const productEndedAt = customerProduct.ended_at;

  // Product hasn't started yet
  if (endMs && productStartsAt >= endMs) return false;

  // Product has already ended
  if (productEndedAt && productEndedAt <= startMs) return false;

  return true;
};
```

## customerProductsToPhaseItems

Converts customer products to phase items with quantity merging:

```typescript
const customerProductsToPhaseItems = ({
  ctx,
  billingContext,
  customerProducts,
}: { ... }): Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] => {
  // Track stripePriceId -> quantity (undefined means metered/no quantity)
  const itemMap = new Map<string, number | undefined>();

  for (const customerProduct of customerProducts) {
    const { recurringItems } = customerProductToStripeItemSpecs({ ctx, customerProduct, billingContext });

    for (const item of recurringItems) {
      if (item.quantity === undefined) {
        // Metered price - don't set quantity
        if (!itemMap.has(item.stripePriceId)) {
          itemMap.set(item.stripePriceId, undefined);
        }
      } else {
        // Licensed price - accumulate quantity
        const currentQuantity = itemMap.get(item.stripePriceId) ?? 0;
        itemMap.set(item.stripePriceId, currentQuantity + item.quantity);
      }
    }
  }

  return Array.from(itemMap.entries()).map(([price, quantity]) => {
    if (quantity === undefined) {
      return { price };
    }
    return { price, quantity };
  });
};
```

## Common Issues

### 1. Wrong Number of Phases

**Symptom**: More or fewer phases than expected

**Debug steps**:
1. Log transition points: `logTransitionPoints({ ctx, customerProducts, transitionPoints, nowMs })`
2. Check `starts_at` and `ended_at` on customer products
3. Verify timestamps are normalized to seconds

### 2. Missing Products in Phase

**Symptom**: Product not appearing in a phase where it should be active

**Debug steps**:
1. Check `isCustomerProductActiveDuringPeriod` logic
2. Verify product `starts_at` < phase `endMs`
3. Verify product `ended_at` > phase `startMs` (or null)

### 3. Spurious Phases from Millisecond Differences

**Symptom**: Extra phases created from tiny timing differences

**Fix**: Ensure all timestamps are normalized via `truncateMsToSecondPrecision`

## Running Tests

```bash
bun test server/tests/unit/billing/stripe/subscription-schedules/build-schedule-phases.spec.ts
```

The test file contains comprehensive scenarios for validating phase building logic.

## Key Files

| File | Purpose |
|------|---------|
| `buildStripePhasesUpdate.ts` | Main function |
| `buildTransitionPoints.ts` | Find all transition timestamps |
| `isCustomerProductActiveAtEpochMs.ts` | Check if product active in period |
| `customerProductToStripeItemSpecs.ts` | Convert product to Stripe items |
| `logBuildPhaseHelpers.ts` | Logging utilities |
