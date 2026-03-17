# Invoicing Utilities (Pure Calculations)

This document covers the pure calculation utilities in `shared/utils/billingUtils/` that determine what customers are charged. These are the foundation of all billing operations.

## Overview

The invoicing utilities are **pure functions** with no side effects or API calls. They calculate:
- Line item amounts (what to charge)
- Proration (partial period charges)
- Tiered pricing (usage-based amounts)
- Billing periods (when cycles start/end)

**Location**: `shared/utils/billingUtils/`

## Directory Structure

```
shared/utils/billingUtils/
├── cycleUtils/                    # Billing cycle calculations
│   ├── getCycleEnd.ts             # Next cycle end timestamp
│   ├── getCycleStart.ts           # Current cycle start timestamp
│   ├── getCycleIntervalFunctions.ts
│   └── getLineItemBillingPeriod.ts
│
├── intervalUtils/                 # Date interval math
│   ├── addDuration.ts
│   └── intervalArithmetic.ts
│
├── invoicingUtils/                # Line item generation
│   ├── lineItemBuilders/          # Build LineItem objects
│   │   ├── buildLineItem.ts       # Core builder
│   │   ├── fixedPriceToLineItem.ts
│   │   └── usagePriceToLineItem.ts
│   │
│   ├── lineItemUtils/             # Amount calculations
│   │   ├── priceToLineAmount.ts   # Price → amount
│   │   ├── tiersToLineAmount.ts   # Tiered pricing
│   │   └── lineItemToCredit.ts    # Convert to refund
│   │
│   ├── prorationUtils/            # Partial period charges
│   │   ├── applyProration.ts      # Core proration math
│   │   ├── applyProrationToLineItem.ts
│   │   └── prorationConfigUtils.ts
│   │
│   └── descriptionUtils/          # Invoice descriptions
│       ├── fixedPriceToLineDescription.ts
│       ├── usagePriceToLineDescription.ts
│       └── lineItemToPeriodDescription.ts
│
└── usageUtils/
    └── roundUsageToNearestBillingUnit.ts
```

## Core Concepts

### LineItem

A `LineItem` represents a single charge or refund on an invoice:

```typescript
interface LineItem {
  amount: number;           // Positive = charge, negative = refund
  description: string;      // Human-readable description
  context: LineItemContext; // Metadata about the charge
  stripePriceId?: string;
  stripeProductId?: string;
  chargeImmediately: boolean;
}
```

### LineItemContext

Context needed to build a line item:

```typescript
interface LineItemContext {
  price: Price;
  product: Product;
  feature?: Feature;
  direction: "charge" | "refund";
  billingPeriod?: BillingPeriod;
  now: number;
}

interface BillingPeriod {
  start: number;  // Unix ms
  end: number;    // Unix ms
}
```

## Amount Calculation

### priceToLineAmount

Central function for calculating charge amounts:

```typescript
// Location: invoicingUtils/lineItemUtils/priceToLineAmount.ts

export const priceToLineAmount = ({
  price,
  overage,
  multiplier = 1,
}: {
  price: Price;
  overage?: number;      // For usage-based prices
  multiplier?: number;   // For fixed prices (e.g., 3 seats)
}): number => {
  // Fixed prices: flat amount × multiplier
  if (isFixedPrice(price)) {
    return price.config.amount * multiplier;
  }

  // Usage-based prices: tiered calculation
  return tiersToLineAmount({ price, overage, billingUnits });
};
```

### tiersToLineAmount

Calculates amount for tiered/usage-based prices:

```typescript
// Location: invoicingUtils/lineItemUtils/tiersToLineAmount.ts

export const tiersToLineAmount = ({
  price,
  overage,
  billingUnits = 1,
}: {
  price: Price;
  overage: number;
  billingUnits?: number;
}): number => {
  // 1. Round to billing units
  const roundedOverage = roundUsageToNearestBillingUnit({ usage: overage, billingUnits });

  // 2. Walk through tiers
  let amount = 0;
  let remaining = roundedOverage;
  let lastTierTo = 0;

  for (const tier of price.config.usage_tiers) {
    if (remaining <= 0) break;

    const tierSize = tier.to === Infinite 
      ? remaining 
      : Math.min(remaining, tier.to - lastTierTo);

    const rate = tier.amount / billingUnits;
    amount += rate * tierSize;
    remaining -= tierSize;

    if (tier.to !== Infinite) {
      lastTierTo = tier.to;
    }
  }

  return amount;
};
```

**Example: Tiered pricing**

```
Tiers: [
  { to: 100, amount: 0.10 },      // First 100 units: $0.10 each
  { to: 1000, amount: 0.05 },     // Next 900 units: $0.05 each
  { to: Infinite, amount: 0.01 }  // Beyond 1000: $0.01 each
]

Usage: 1500 units

Calculation:
  100 × $0.10 = $10.00
  900 × $0.05 = $45.00
  500 × $0.01 = $5.00
  Total: $60.00
```

## Proration

### applyProration

Calculates partial period charges:

```typescript
// Location: invoicingUtils/prorationUtils/applyProration.ts

export const applyProration = ({
  now,
  billingPeriod,
  amount,
}: {
  now: number;
  billingPeriod: BillingPeriod;
  amount: number;
}): number => {
  const { start, end } = billingPeriod;

  // Remaining time in period / Total period length
  const ratio = (end - now) / (end - start);

  return amount * ratio;
};
```

**Example: Mid-cycle subscription**

```
Billing period: Jan 1 - Jan 31 (30 days)
Subscription starts: Jan 15
Monthly price: $30

Proration:
  Remaining days: 16
  Ratio: 16/30 = 0.533
  Prorated amount: $30 × 0.533 = $16.00
```

## Line Item Builders

### buildLineItem

Core builder that applies proration and direction:

```typescript
// Location: invoicingUtils/lineItemBuilders/buildLineItem.ts

export const buildLineItem = ({
  context,
  amount,
  description,
  stripePriceId,
  stripeProductId,
  shouldProrate = true,
  chargeImmediately = true,
}: { ... }): LineItem => {
  // 1. Apply proration if needed
  if (shouldProrate && context.billingPeriod) {
    amount = applyProration({
      now: context.now,
      billingPeriod: context.billingPeriod,
      amount,
    });
  }

  // 2. Handle refund direction
  if (context.direction === "refund") {
    amount = -amount;
  }

  return { amount, description, context, ... };
};
```

### fixedPriceToLineItem

Builds line item for fixed prices (subscriptions, one-time):

```typescript
// Location: invoicingUtils/lineItemBuilders/fixedPriceToLineItem.ts

export const fixedPriceToLineItem = ({
  currency,
  quantity = 1,
  context,
}: {
  currency?: string;
  quantity?: number;
  context: LineItemContext;
}): LineItem => {
  const amount = priceToLineAmount({ price: context.price, multiplier: quantity });
  const description = fixedPriceToDescription({ price, currency, context });

  return buildLineItem({ context, amount, description, ... });
};
```

### usagePriceToLineItem

Builds line item for usage-based prices:

```typescript
// Location: invoicingUtils/lineItemBuilders/usagePriceToLineItem.ts

export const usagePriceToLineItem = ({
  cusEnt,
  context,
  shouldProrateOverride,
}: {
  cusEnt: FullCusEntWithFullCusProduct;
  context: LineItemContext;
  shouldProrateOverride?: boolean;
}): LineItem => {
  // 1. Get overage (amount to charge)
  let overage = 0;
  if (isPrepaidPrice(price)) {
    overage = cusEntsToPrepaidQuantity({ cusEnts: [cusEnt] });
  } else {
    overage = cusEntToInvoiceOverage({ cusEnt });
  }

  // 2. Calculate amount
  const amount = priceToLineAmount({ price, overage });

  // 3. Don't prorate consumable prices (unless override)
  const shouldProrate = shouldProrateOverride ?? !isConsumablePrice(price);

  return buildLineItem({ context, amount, description, shouldProrate, ... });
};
```

## Billing Cycle Utilities

### getCycleEnd

Calculates when the current billing cycle ends:

```typescript
// Location: cycleUtils/getCycleEnd.ts

export const getCycleEnd = ({
  anchor,
  interval,
  intervalCount = 1,
  now,
}: {
  anchor: number | "now";    // Billing anchor timestamp
  interval: BillingInterval; // "month", "year", etc.
  intervalCount?: number;    // e.g., 2 for bi-monthly
  now: number;
}): number => {
  // 1. Calculate how many complete cycles have passed
  const intervalsPassed = difference(nowDate, anchorDate);
  const cyclesPassed = Math.floor(intervalsPassed / intervalCount);

  // 2. Next cycle end is (cyclesPassed + 1) cycles from anchor
  return add(anchorDate, (cyclesPassed + 1) * intervalCount);
};
```

### getCycleStart

Calculates when the current billing cycle started:

```typescript
// Similar logic, returns cyclesPassed * intervalCount from anchor
```

### getLineItemBillingPeriod

Gets the billing period for a line item:

```typescript
// Combines getCycleStart and getCycleEnd to get the full period
```

## Usage in V2 Billing

The V2 billing layer uses these utilities in `buildAutumnLineItems`:

```typescript
// Location: billing/v2/compute/computeAutumnUtils/buildAutumnLineItems.ts

export const buildAutumnLineItems = ({
  ctx,
  newCustomerProducts,
  deletedCustomerProduct,
  billingContext,
}: { ... }) => {
  // Refund line items for deleted product
  const deletedLineItems = deletedCustomerProduct
    ? customerProductToLineItems({
        customerProduct: deletedCustomerProduct,
        direction: "refund",
        priceFilters: { excludeOneOffPrices: true },
      })
    : [];

  // Charge line items for new products
  const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
    customerProductToLineItems({
        customerProduct: newCustomerProduct,
        direction: "charge",
      }),
  );

  return [...deletedLineItems, ...newLineItems];
};
```

### customerProductToLineItems

Converts a customer product to line items:

```typescript
// Location: billing/v2/utils/lineItems/customerProductToLineItems.ts

// For each price in the customer product:
// - Fixed prices → fixedPriceToLineItem()
// - Usage prices → usagePriceToLineItem()
```

## Common Patterns

### Charge for New Subscription

```typescript
const context: LineItemContext = {
  price: monthlyPrice,
  product: proProduct,
  direction: "charge",
  billingPeriod: { start: cycleStart, end: cycleEnd },
  now: Date.now(),
};

const lineItem = fixedPriceToLineItem({ context, quantity: 1 });
// Result: Prorated charge for remaining period
```

### Refund for Cancelled Subscription

```typescript
const context: LineItemContext = {
  price: monthlyPrice,
  product: premiumProduct,
  direction: "refund",
  billingPeriod: { start: cycleStart, end: cycleEnd },
  now: Date.now(),
};

const lineItem = fixedPriceToLineItem({ context, quantity: 1 });
// Result: Negative amount (prorated refund)
```

### Usage-Based Charge

```typescript
const lineItem = usagePriceToLineItem({
  cusEnt: customerEntitlement, // Has usage data
  context: { price, product, direction: "charge", now },
});
// Result: Tiered amount based on usage
```

## Key Points

1. **Pure functions**: No side effects, no API calls
2. **Proration is automatic**: Applied by `buildLineItem` when `billingPeriod` is provided
3. **Direction controls sign**: `"charge"` = positive, `"refund"` = negative
4. **Tiered pricing walks tiers**: From lowest to highest, accumulating costs
5. **Consumable prices don't prorate**: Usage is charged as-is (no partial period)

## Debugging

### Check proration calculation

```typescript
console.log("Billing period:", context.billingPeriod);
console.log("Now:", context.now);
console.log("Ratio:", (billingPeriod.end - now) / (billingPeriod.end - billingPeriod.start));
```

### Check tiered amount

```typescript
console.log("Overage:", overage);
console.log("Tiers:", price.config.usage_tiers);
const amount = tiersToLineAmount({ price, overage, billingUnits });
console.log("Calculated amount:", amount);
```

### Check line item output

```typescript
const lineItem = fixedPriceToLineItem({ ... });
console.log("Line item:", {
  amount: lineItem.amount,
  description: lineItem.description,
  direction: lineItem.context.direction,
});
```
