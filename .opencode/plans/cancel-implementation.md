# Cancel Implementation Plan

This document outlines the implementation plan for adding `cancel` support to the update subscription endpoint.

## Overview

The `cancel` parameter allows users to:
- Schedule a subscription cancellation at the end of the current billing cycle (`'end_of_cycle'`)
- Cancel immediately (`'immediately'`)

These can be optionally combined with other subscription updates (like custom plan changes or quantity updates).

---

## API Parameter

```typescript
cancel: z.enum(["immediately", "end_of_cycle"]).nullable().optional()
```

- `'end_of_cycle'` - Schedule cancellation at cycle end
- `'immediately'` - Cancel now
- `null` - Uncancel (future work)
- `undefined` - No cancel action

---

## Key Behaviors

### 1. `cancel: 'end_of_cycle'`
- Sets `canceled: true`, `canceled_at: currentEpochMs`, `ended_at: cycleEnd` on customer product
- Inserts scheduled default product (starts at `cycleEnd`) for main products
- Deletes any existing scheduled product in the group

### 2. `cancel: 'immediately'`
- Sets `canceled: true`, `canceled_at: currentEpochMs`, `ended_at: currentEpochMs`, `status: Expired`
- Inserts active default product for main products
- Deletes any existing scheduled product in the group

### 3. Combining with `items` (custom plan)
- Cancel updates are applied to the NEW inserted customer products
- Example: `cancel: 'end_of_cycle'` + `items` = switch to custom plan AND schedule cancellation

### 4. Default products
- Default products are FREE - no Stripe subscription needed
- Add-ons do NOT trigger default products

### 5. Existing scheduled products
- If there's already a scheduled customer product (downgrade in progress), it gets deleted
- Uses `findMainScheduledCustomerProductByGroup`

---

## Architecture

### Compute Layer Structure

```
server/src/internal/billing/v2/updateSubscription/compute/cancel/
├── computeCancelPlan.ts              # Orchestrator - main entry point
├── computeEndOfCycleMs.ts            # Step 1: Calculate cycle end timestamp
├── computeCancelUpdates.ts           # Step 2: Build cancel field updates
├── computeDefaultCustomerProduct.ts  # Step 3: Create default product to insert
├── computeCustomerProductToDelete.ts # Step 4: Find scheduled product to delete
└── applyCancelPlan.ts                # Apply computed values to the plan
```

### Flow

```typescript
computeCancelPlan({ ctx, billingContext, params, plan }) {
  if (!params.cancel) return plan;
  
  // Step 1: Calculate when the subscription ends
  const endOfCycleMs = computeEndOfCycleMs({ ... });
  
  // Step 2: Build cancel updates for customer product
  const cancelUpdates = computeCancelUpdates({ cancelMode, endOfCycleMs, currentEpochMs });
  
  // Step 3: Create default product (if applicable)
  const defaultProduct = computeDefaultCustomerProduct({ ..., endOfCycleMs });
  
  // Step 4: Find existing scheduled product to delete
  const productToDelete = computeCustomerProductToDelete({ ... });
  
  // Apply all computed values to the plan
  return applyCancelPlan({ plan, cancelUpdates, defaultProduct, productToDelete });
}
```

---

## Implementation Status

### Completed

#### 1. Updated params schema
**File:** `shared/api/billing/updateSubscription/updateSubscriptionV0Params.ts`
```typescript
cancel: z.enum(["immediately", "end_of_cycle"]).nullable().optional(),
```

#### 2. Updated `AutumnBillingPlan` schema
**File:** `server/src/internal/billing/v2/types/autumnBillingPlan.ts`
- Changed cancel fields from `.optional()` to `.nullish()` to support setting to `null` for uncancel

#### 3. Updated `setupDefaultProductContext`
**File:** `server/src/internal/billing/v2/updateSubscription/setup/setupDefaultProductContext.ts`
- Now checks for `params.cancel` instead of old `params.cancel_end_of_cycle`

---

#### 4. Cancel compute layer (DONE)
**Folder:** `server/src/internal/billing/v2/updateSubscription/compute/cancel/`

| File | Status | Description |
|------|--------|-------------|
| `computeEndOfCycleMs.ts` | Done | Calculate cycle end timestamp |
| `computeCancelUpdates.ts` | Done | Build cancel field updates |
| `computeDefaultCustomerProduct.ts` | Done | Create default product to insert |
| `computeCustomerProductToDelete.ts` | Done | Find scheduled product to delete |
| `applyCancelPlan.ts` | Done | Apply computed values to plan |
| `computeCancelPlan.ts` | Done | Orchestrator function |

#### 5. Integrated into `computeUpdateSubscriptionPlan`
**File:** `server/src/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionPlan.ts`
- Calls `computeCancelPlan` after computing the base plan (quantity/custom)

---

## Stripe Integration

### Overview

The Stripe layer needs to handle cancellation by:
1. Setting `cancel_at` timestamp on the subscription (for simple cancel scenarios)
2. Using subscription schedules with `end_behavior: "cancel"` (for multi-phase scenarios)
3. Releasing existing schedules when transitioning to simple cancel

### Key Insight: Phase-Based Detection

When we build Stripe phases from customer products:
- **Phase 1**: Current products with items (now → `ended_at`)
- **Phase 2**: Empty (no items) if all products are canceling

If Phase 2 is empty, it signals a "cancel at end" scenario. The `cancel_at` timestamp is Phase 2's `start_date`.

### Scenarios

#### Scenario 1: Simple cancel (no future phases with items)
- Customer has Pro plan, cancels at end of cycle
- No other products/entities continue
- **Stripe action**: Set `cancel_at` on subscription directly

#### Scenario 2: Cancel with schedule (multi-entity or downgrade)
- Entity A on Pro, Entity B on Pro
- Entity A cancels at end of cycle
- **Stripe action**: Update schedule with Phase 1 (both entities) → Phase 2 (Entity B only)

#### Scenario 3: Cancel when schedule exists (but results in simple cancel)
- Schedule exists managing a downgrade
- User cancels the whole thing
- **Stripe action**: Release schedule + set `cancel_at` on subscription

### Implementation

#### 1. `buildStripeSubscriptionScheduleAction` - New Return Type

```typescript
interface SubscriptionScheduleBuildResult {
  scheduleAction?: StripeSubscriptionScheduleAction;
  subscriptionCancelAt?: number; // Unix ms timestamp to set on subscription
}
```

The function detects:
- If trailing empty phase exists → `shouldCancelAtEnd = true`
- If only 1 phase starting now + shouldCancelAtEnd:
  - Release schedule (if exists) + return `subscriptionCancelAt`
- If multiple phases with items:
  - Return schedule action with `end_behavior: "cancel"` if shouldCancelAtEnd

#### 2. New `release` Action Type

Added to `StripeSubscriptionScheduleActionSchema`:
```typescript
z.object({
  type: z.literal("release"),
  stripeSubscriptionScheduleId: z.string(),
})
```

#### 3. `cancel_at` in Subscription Actions

Both `buildStripeSubscriptionUpdateAction` and `buildStripeSubscriptionCreateAction` accept `subscriptionCancelAt` param and include it in Stripe params.

For updates, only set if different from current `stripeSubscription.cancel_at`.

### Files Modified

| File | Change |
|------|--------|
| `types/stripeBillingPlan/stripeSubscriptionScheduleAction.ts` | Add `release` action type |
| `actionBuilders/buildStripeSubscriptionScheduleAction.ts` | New return type, detect cancel scenarios |
| `actionBuilders/evaluateStripeBillingPlan.ts` | Pass `subscriptionCancelAt` to subscription builder |
| `actionBuilders/buildStripeSubscriptionAction.ts` | Pass `subscriptionCancelAt` to create/update builders |
| `utils/subscriptions/buildStripeSubscriptionUpdateAction.ts` | Add `cancel_at` to params |
| `utils/subscriptions/buildStripeSubscriptionCreateAction.ts` | Add `cancel_at` to params |
| `execute/executeStripeSubscriptionScheduleAction.ts` | Handle `release` action |

### Execution Order

Current order (subscription → schedule) is maintained. If Stripe doesn't allow setting `cancel_at` while schedule exists, we'll revisit.

---

### Remaining Work (Future)

#### 1. Validation / Error Handling
**File:** `server/src/internal/billing/v2/updateSubscription/errors/handleUpdateSubscriptionErrors.ts`

Add validation for:
- Cannot cancel free products with `'end_of_cycle'` (use `'immediately'` instead)
- Cannot cancel if already canceled (or handle gracefully)

#### 2. Execute Layer - Persist Cancel Fields
Ensure the update logic persists cancel fields to DB.

#### 3. Uncancel (`cancel: null`)
- Clear cancel fields
- Delete scheduled default product
- Unset `cancel_at` on Stripe subscription

#### 4. Proration for `cancel: 'immediately'`
- Add `prorate` option support

#### 5. Atomicity for schedule release + subscription update
- Currently executing subscription action before schedule release
- If Stripe requires schedule release first, need to handle potential failure state

---

## Test Cases

1. **Basic `cancel: 'end_of_cycle'`** - Cancel a paid subscription at end of cycle
2. **Basic `cancel: 'immediately'`** - Cancel a paid subscription immediately
3. **Cancel + custom plan** - Update to custom plan AND set cancel
4. **Cancel with existing scheduled product** - Should delete the scheduled product
5. **Cancel add-on** - Should NOT create default product
6. **Cancel free product** - Should throw error for `'end_of_cycle'`

---

## Dependencies

- `getLargestInterval` from `server/src/internal/products/prices/priceUtils/priceIntervalUtils.ts`
- `getCycleEnd` from `@autumn/shared`
- `cusProductToPrices` from `@autumn/shared`
- `findMainScheduledCustomerProductByGroup` from `@autumn/shared`
- `initFullCustomerProduct` from `server/src/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct.ts`
- `getFreeDefaultProductByGroup` from `server/src/internal/customers/cusProducts/cusProductUtils.ts`
