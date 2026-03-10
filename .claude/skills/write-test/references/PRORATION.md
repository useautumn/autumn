# Proration Utilities

When testing mid-cycle upgrades/downgrades, use the proration utilities to calculate exact expected amounts.

**Location:** `@tests/integration/billing/utils/proration/`

## Import

```typescript
import { 
  getBillingPeriod, 
  calculateProration, 
  calculateProratedDiff,
  calculateCrossIntervalUpgrade,
} from "@tests/integration/billing/utils/proration";
```

## `calculateProratedDiff` (Most Common)

Calculate net charge for upgrade/downgrade. Works for base prices, prepaid, and allocated features.

```typescript
const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);

const expectedCharge = calculateProratedDiff({
  customer: customerBefore,
  advancedTo,                // From initScenario
  oldAmount: 20,             // Pro base price
  newAmount: 50,             // Premium base price
});

expect(preview.total).toBeCloseTo(expectedCharge, 0);
```

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `customer` | `ApiCustomerV3` | Yes | Customer object from API |
| `advancedTo` | `number` | Yes | Current time from initScenario |
| `oldAmount` | `number` | Yes | Old/current price (credited) |
| `newAmount` | `number` | Yes | New price (charged) |
| `productId` | `string` | No | Filter by specific product ID |
| `interval` | `"month" \| "year"` | No | Filter by billing interval |
| `entityId` | `string` | No | For entity-level products |
| `entityIndex` | `number` | No | 0-based index → "ent-1", "ent-2" |

### Multi-Product/Multi-Interval/Entity Examples

```typescript
// Filter by product ID (when customer has multiple products)
calculateProratedDiff({
  customer, advancedTo, oldAmount: 20, newAmount: 50, productId: "pro",
});

// Filter by billing interval (for dual subscriptions)
calculateProratedDiff({
  customer, advancedTo, oldAmount: 20, newAmount: 50, interval: "month",
});

// Entity-level product
calculateProratedDiff({
  customer, advancedTo, oldAmount: 20, newAmount: 50, entityId: "ent-1",
});

// Or using entityIndex (0-based → "ent-1")
calculateProratedDiff({
  customer, advancedTo, oldAmount: 20, newAmount: 50, entityIndex: 0,
});
```

## `calculateCrossIntervalUpgrade` (Monthly → Annual)

Calculate total charge for cross-interval upgrades (e.g., monthly → annual). This is **async** — it fetches the billing anchor from Stripe.

```typescript
const expectedCharge = await calculateCrossIntervalUpgrade({
  customerId,
  advancedTo,                // From initScenario
  oldAmount: 20,             // Current monthly price (credited for remaining period)
  newAmount: 200,            // New annual price (prorated from now to anchor + 1 year)
  oldInterval: "month",      // Default: "month"
});

expect(preview.total).toBeCloseTo(expectedCharge, 0);
```

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `customerId` | `string` | Yes | Customer ID |
| `advancedTo` | `number` | Yes | Current time from initScenario |
| `oldAmount` | `number` | No | Current price (default: 0 = no credit) |
| `newAmount` | `number` | Yes | New annual price |
| `oldInterval` | `"month" \| "year"` | No | Default: "month" |

**Logic:** `total = annualCharge - oldCredit` (Decimal.js, 2 decimal places)

### Example — Monthly to Annual Upgrade

```typescript
test.concurrent(`${chalk.yellowBright("cross-interval: monthly to annual")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });          // $20/mo
  const proAnnual = products.proAnnual({ items: [messagesItem] }); // $200/yr

  const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
    customerId: "cross-interval-test",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro, proAnnual] }),
    ],
    actions: [
      s.billing.attach({ productId: pro.id }),
      s.advanceTestClock({ days: 15 }),
    ],
  });

  const expectedCharge = await calculateCrossIntervalUpgrade({
    customerId,
    advancedTo,
    oldAmount: 20,
    newAmount: 200,
    oldInterval: "month",
  });

  const preview = await autumnV1.billing.previewAttach({
    customer_id: customerId,
    product_id: proAnnual.id,
  });
  expect(preview.total).toBeCloseTo(expectedCharge, 0);
});
```

## Key Behaviors

| Feature Type | Prorated on Upgrade? | Use calculateProratedDiff? |
|--------------|---------------------|----------------------------|
| Base price | ✅ Yes | ✅ Yes |
| Prepaid | ✅ Yes | ✅ Yes |
| Allocated | ✅ Yes | ✅ Yes |
| Consumable (arrear) | ❌ No - full amount | ❌ No - add separately |

## Mixed Prorated + Non-Prorated (Consumable Arrear)

Consumable/arrear charges are **NEVER prorated** — add them separately:

```typescript
// Base price is prorated
const proratedBase = calculateProratedDiff({
  customer: customerBefore, advancedTo, oldAmount: 20, newAmount: 50,
});

// Consumable arrear is NOT prorated - full amount
const arrearOverage = 5; // 100 overage × $0.05

const expectedTotal = proratedBase + arrearOverage;
expect(preview.total).toBeCloseTo(expectedTotal, 0);
```

## `getBillingPeriod`

Get the raw billing period from customer's subscription:

```typescript
const period = getBillingPeriod({ customer });
// Returns: { start: number, end: number } in milliseconds

// With filters
const monthlyPeriod = getBillingPeriod({ customer, interval: "month" });
const entityPeriod = getBillingPeriod({ customer, entityIndex: 0 });
```

## `calculateProration`

Calculate prorated amount for a single price (not the difference):

```typescript
const proratedCharge = calculateProration({
  customer, advancedTo, amount: 50,  // Full price
});
// Returns prorated amount for remaining period
```

## Why Use These Utilities?

1. **Correct billing period**: Gets actual `current_period_start/end` from Stripe (not estimated with `ms.days(30)`)
2. **Precision**: Uses `Decimal.js` internally — no floating point errors
3. **Auto-flooring**: Automatically floors `advancedTo` to match Stripe's frozen_time
4. **Multi-subscription support**: Handles monthly/annual dual subscriptions, entity products

## Anti-Pattern (DON'T DO THIS)

```typescript
// ❌ BAD — estimating billing period manually
const periodStart = advancedTo - ms.days(15);
const periodEnd = periodStart + ms.days(30); // Wrong! Months vary

// ✅ GOOD — use the utility
const expectedTotal = calculateProratedDiff({
  customer: customerBefore, advancedTo, oldAmount: 20, newAmount: 50,
});
```
