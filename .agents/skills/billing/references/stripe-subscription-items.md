# Stripe Subscription Items Mapping

This document explains how Autumn maps customer products to Stripe subscription items for **immediate** subscription changes.

## Overview

When updating a subscription immediately (not scheduling for the future), we need to compute the diff between the current Stripe subscription items and the desired state based on Autumn customer products.

**Key function**: `buildStripeSubscriptionItemsUpdate`

**Location**: `billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate.ts`

## Pipeline

```
FullCusProduct[] (final state)
    ↓
filterCustomerProductsByStripeSubscriptionId()
    ↓  Only products on this subscription
filterCustomerProductsByActiveStatuses()
    ↓  Only Active/Trialing products
customerProductsToRecurringStripeItemSpecs()
    ↓  Convert to StripeItemSpec[] (intermediate format)
stripeItemSpecsToSubItemsUpdate()
    ↓  Diff against current subscription
Stripe.SubscriptionUpdateParams.Item[]
```

## Step 1: Filter Customer Products

Only include customer products that:
1. Belong to this Stripe subscription (matching `stripe_subscription_id`)
2. Have an active status (`Active` or `Trialing`)

```typescript
// Filter by subscription
const relatedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
  customerProducts: finalCustomerProducts,
  stripeSubscriptionId: billingContext.stripeSubscription?.id,
});

// Filter by status
const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
  customerProducts: relatedCustomerProducts,
});
```

## Step 2: Convert to StripeItemSpec

For each customer product, convert to an intermediate `StripeItemSpec` format:

```typescript
interface StripeItemSpec {
  stripePriceId: string;      // Stripe price ID
  quantity: number | undefined; // undefined for metered prices
  autumnPrice: Price;         // Original Autumn price
}
```

**Key function**: `customerProductToStripeItemSpecs`

**Location**: `billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs.ts`

### Quantity Rules

| Autumn Price Type | Stripe `quantity` | Source |
|-------------------|-------------------|--------|
| **Fixed** (`FixedCycle`, `OneOff`) | `1` | Hardcoded |
| **Prepaid** (`UsageInAdvance`) | `options.quantity` | From `customerProduct.options[]` |
| **Consumable** (`UsageInArrear`) | `undefined` | Metered - no quantity |
| **Consumable (Entity)** | `0` | Uses `stripe_empty_price_id` |
| **Allocated** (`InArrearProrated`) | `existingUsage` | Calculated from `allowance - balance` |

### Key Distinctions

- **`quantity: undefined`** → Metered price (Stripe manages usage reporting)
- **`quantity: 0`** → Entity-linked consumable (placeholder on subscription)
- **`quantity: N`** → Licensed price (N units)

### Quantity Merging

When multiple customer products use the same Stripe price:

```typescript
for (const recurringItem of recurringItems) {
  const existingItem = stripeItemSpecsByPriceId.get(recurringItem.stripePriceId);

  if (existingItem) {
    // For metered prices, quantity is undefined and should stay undefined
    if (recurringItem.quantity === undefined && existingItem.quantity === undefined) {
      // Both metered - keep undefined
    } else {
      // Licensed prices - accumulate quantity
      existingItem.quantity = (existingItem.quantity ?? 0) + (recurringItem.quantity ?? 0);
    }
  } else {
    stripeItemSpecsByPriceId.set(recurringItem.stripePriceId, recurringItem);
  }
}
```

## Step 3: Diff Against Current Subscription

Compare the desired `StripeItemSpec[]` against `stripeSubscription.items.data`:

```typescript
const stripeItemSpecsToSubItemsUpdate = ({
  billingContext,
  stripeItemSpecs,
}: { ... }): Stripe.SubscriptionUpdateParams.Item[] => {
  const currentSubscriptionItems = stripeSubscription?.items.data ?? [];
  const subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];

  // Check each desired item
  for (const stripeItemSpec of stripeItemSpecs) {
    const existingItem = findStripeSubscriptionItemByStripePriceId({
      stripePriceId: stripeItemSpec.stripePriceId,
      stripeSubscriptionItems: currentSubscriptionItems,
    });

    const shouldUpdateItem = existingItem && existingItem.quantity !== stripeItemSpec.quantity;
    const shouldCreateItem = !existingItem;

    if (shouldUpdateItem) {
      // Update existing item
      if (stripeItemSpec.quantity === undefined) {
        subItemsUpdate.push({ id: existingItem.id }); // Metered - no quantity
      } else {
        subItemsUpdate.push({ id: existingItem.id, quantity: stripeItemSpec.quantity });
      }
    }

    if (shouldCreateItem) {
      // Create new item
      if (stripeItemSpec.quantity === undefined) {
        subItemsUpdate.push({ price: stripeItemSpec.stripePriceId }); // Metered
      } else {
        subItemsUpdate.push({ price: stripeItemSpec.stripePriceId, quantity: stripeItemSpec.quantity });
      }
    }
  }

  // Check for items to delete
  for (const subItem of currentSubscriptionItems) {
    const stripeItemSpec = findStripeItemSpecByStripePriceId({
      stripePriceId: stripeSubscriptionItemToStripePriceId(subItem),
      stripeItemSpecs,
    });

    const shouldRemoveItem = !stripeItemSpec;
    if (shouldRemoveItem) {
      subItemsUpdate.push({ id: subItem.id, deleted: true });
    }
  }

  return subItemsUpdate;
};
```

### Diff Logic Summary

| Scenario | Action |
|----------|--------|
| Price exists in desired but not in current | Create: `{ price, quantity }` |
| Price exists in both, quantity changed | Update: `{ id, quantity }` |
| Price exists in current but not in desired | Delete: `{ id, deleted: true }` |
| Price exists in both, quantity same | No action |

## Usage in buildStripeSubscriptionAction

The subscription items update is used to determine what action to take:

```typescript
// From: providers/stripe/actionBuilders/buildStripeSubscriptionAction.ts

export const buildStripeSubscriptionAction = ({
  ctx,
  billingContext,
  autumnBillingPlan,
  finalCustomerProducts,
}: { ... }): StripeSubscriptionAction | undefined => {
  const { stripeSubscription } = billingContext;

  const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
    ctx,
    billingContext,
    finalCustomerProducts,
  });

  // Case 1: No subscription and no items -> no action
  if (!stripeSubscription && subItemsUpdate.length === 0) {
    return undefined;
  }

  // Case 2: No subscription but has items -> create subscription
  if (!stripeSubscription && subItemsUpdate.length > 0) {
    return buildStripeSubscriptionCreateAction({ ... });
  }

  // Case 3: All items deleted -> cancel subscription
  if (stripeSubscription && 
      subItemsUpdate.length === stripeSubscription.items.data.length &&
      subItemsUpdate.every((item) => item.deleted)) {
    return { type: "cancel", stripeSubscriptionId: stripeSubscription.id };
  }

  // Case 4: Has subscription -> update
  if (stripeSubscription) {
    return buildStripeSubscriptionUpdateAction({ ... });
  }

  return undefined;
};
```

## Common Issues

### 1. Wrong Quantities

**Symptom**: Subscription has wrong number of seats

**Debug steps**:
1. Check `customerProduct.options[]` for prepaid prices
2. Verify `entToOptions()` is finding the right option
3. Log output of `customerProductToStripeItemSpecs`

### 2. Missing Items

**Symptom**: Items not appearing on subscription

**Debug steps**:
1. Check customer product has `stripe_subscription_id` set
2. Check customer product status is `Active` or `Trialing`
3. Check price has `stripe_price_id` set

### 3. Duplicate Items

**Symptom**: Same price appearing twice

**Debug steps**:
1. Check quantity merging logic
2. Verify `stripePriceId` is consistent across products

## Key Files

| File | Purpose |
|------|---------|
| `buildStripeSubscriptionItemsUpdate.ts` | Main function |
| `customerProductToStripeItemSpecs.ts` | Convert customer product to specs |
| `priceToStripeItem.ts` | Convert single price to Stripe item |
| `findStripeItemSpec.ts` | Utility to find spec by price ID |
