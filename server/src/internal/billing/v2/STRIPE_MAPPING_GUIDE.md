# Autumn → Stripe Mapping Guide

This guide explains how Autumn maps customer products and prices to Stripe subscription items and schedule phases.

## Overview

Autumn uses two key functions to synchronize billing state with Stripe:

1. **`buildStripeSubscriptionItemsUpdate`** - Updates a current subscription's items
2. **`buildStripePhasesUpdate`** - Builds phases for subscription schedules (future changes)

Both functions use the same core conversion: `customerProductToStripeItemSpecs`.

---

## Core Conversion: `customerProductToStripeItemSpecs`

Converts a single `FullCusProduct` into Stripe item specs (intermediate format).

### Flow

```
FullCusProduct
    ↓
customer_prices[] → loop each customer price
    ↓
priceToStripeItem() → converts based on BillingType
    ↓
StripeItemSpec { stripePriceId, quantity, autumnPrice }
```

### Price Type Mapping

| Autumn Price Type | Stripe `quantity` | Source of Quantity |
|-------------------|-------------------|-------------------|
| **Fixed** (`FixedCycle`, `OneOff`) | `1` | Hardcoded multiplier |
| **Prepaid** (`UsageInAdvance`) | `options.quantity` | `customerProduct.options[]` matched by `internal_feature_id` |
| **Consumable** (`UsageInArrear`) | `undefined` (metered) | N/A - metered prices don't have quantity |
| **Consumable (Entity)** | `0` | Uses `stripe_empty_price_id` with explicit `quantity: 0` |
| **Allocated** (`InArrearProrated`) | `existingUsage` | `cusEntToInvoiceUsage()` - calculated from `allowance - balance` |

### Key Distinctions

- **`quantity: undefined`** → Metered price (Stripe manages usage reporting)
- **`quantity: 0`** → Entity-linked consumable (placeholder on subscription)
- **`quantity: N`** → Licensed price (N units)

---

## Function 1: `buildStripeSubscriptionItemsUpdate`

Updates an **existing subscription's items** to reflect current state.

### When Used
- Attaching/detaching products immediately
- Upgrading/downgrading without scheduling

### Flow

```
finalCustomerProducts[]
    ↓
filterCustomerProductsByStripeSubscriptionId()  → only products on this subscription
    ↓
filterCustomerProductsByActiveStatuses()        → only Active/Trialing products
    ↓
customerProductsToRecurringStripeItemSpecs()    → convert to StripeItemSpec[]
    ↓
stripeItemSpecsToSubItemsUpdate()               → diff against current subscription
    ↓
Stripe.SubscriptionUpdateParams.Item[]
```

### Quantity Merging

When multiple customer products use the same Stripe price:
- **Licensed prices**: Quantities sum (e.g., 2 products × qty 1 = total qty 2)
- **Metered prices**: Stay `undefined` (no summing needed)

### Diff Logic

Compares new `StripeItemSpec[]` against `stripeSubscription.items.data`:
- **Create**: Price not in current subscription → `{ price, quantity }`
- **Update**: Quantity changed → `{ id, quantity }`
- **Delete**: Price no longer needed → `{ id, deleted: true }`

---

## Function 2: `buildStripePhasesUpdate`

Builds **subscription schedule phases** for future changes.

### When Used
- Scheduling downgrades at cycle end
- Adding products in the future
- Any scheduled product changes

### Flow

```
customerProducts[]
    ↓
buildTransitionPoints()                    → find all start/end timestamps
    ↓
for each transition period:
    ↓
    isCustomerProductActiveDuringPeriod()  → filter active products
    ↓
    customerProductsToPhaseItems()         → convert to phase items
    ↓
Stripe.SubscriptionScheduleUpdateParams.Phase[]
```

### Transition Points

A transition point is any timestamp where the subscription changes:
- `customerProduct.starts_at` (when product becomes active)
- `customerProduct.ended_at` (when product ends)
- `trialEndsAt` (when trial period ends)
- `newBillingCycleAnchorMs` (when billing cycle changes)

### Phase Structure

Each phase contains:
```typescript
{
  items: [{ price, quantity? }],  // What's active during this phase
  start_date: number,             // Phase start (Unix seconds)
  end_date?: number,              // Phase end (undefined = indefinite)
  trial_end?: number,             // Trial end if applicable
}
```

### Example: Premium → Pro Downgrade

```
Customer Products:
  - Premium: starts_at=now, ended_at=30 days from now
  - Pro: starts_at=30 days from now, ended_at=null

Transition Points: [30 days from now, undefined]

Phases:
  1. Phase 1: now → 30 days
     Items: Premium prices
  
  2. Phase 2: 30 days → ∞
     Items: Pro prices
```

---

## Entity-Level Pricing

When `customerProduct.internal_entity_id` is set, consumable prices use a different Stripe price:

```typescript
// Entity-linked consumable
{
  price: config.stripe_empty_price_id,  // Not the regular stripe_price_id
  quantity: 0                           // Explicit zero
}
```

This allows tracking entity-level usage separately while maintaining subscription item presence.

---

## Quantity Sources Summary

| Price Type | Quantity Source | Location |
|------------|-----------------|----------|
| Fixed | `1` (hardcoded) | `priceToStripeItem.ts` |
| Prepaid | `options.quantity` | `customerProduct.options[]` → `entToOptions()` |
| Consumable | `undefined` | N/A (metered) |
| Consumable (Entity) | `0` | `consumablePriceToStripeItem.ts` |
| Allocated | `cusEntToInvoiceUsage()` | Calculated: `startingBalance - balance` |

---

## Debugging

Enable debug logging to see the mapping process:

```typescript
// Logs transition points and phase construction
logTransitionPoints({ ctx, customerProducts, transitionPoints, nowMs })

// Logs individual phase details
logPhase({ ctx, billingContext, phaseIndex, phase, activeCustomerProducts })
```

Log output shows:
- Customer products with their status and time ranges
- Transition points sequence
- Each phase's items with Autumn price names and quantities
