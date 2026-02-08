# Proration Utilities

When testing mid-cycle upgrades/downgrades, use the proration utilities to calculate exact expected amounts.

**Location:** `@tests/integration/billing/utils/proration/`

## Import

```typescript
import { 
  getBillingPeriod, 
  calculateProration, 
  calculateProratedDiff 
} from "@tests/integration/billing/utils/proration";
```

## `calculateProratedDiff` (Most Common)

Calculate net charge for upgrade/downgrade. Works for base prices, prepaid, and allocated features.

```typescript
const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);

// Calculate prorated difference for base price upgrade
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
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  productId: "pro",
});

// Filter by billing interval (for dual subscriptions - monthly + annual)
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  interval: "month",
});

// Entity-level product
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  entityId: "ent-1",
});

// Or using entityIndex (0-based → "ent-1")
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  entityIndex: 0,
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

Consumable/arrear charges are **NEVER prorated** - add them separately:

```typescript
// Base price is prorated
const proratedBase = calculateProratedDiff({
  customer: customerBefore,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
});

// Consumable arrear is NOT prorated - full amount
const arrearOverage = 5; // 100 overage × $0.05

const expectedTotal = proratedBase + arrearOverage;
expect(preview.total).toBeCloseTo(expectedTotal, 0);
```

## `getBillingPeriod`

Get the raw billing period from customer's subscription (for custom calculations):

```typescript
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";

const period = getBillingPeriod({ customer });
// Returns: { start: number, end: number } in milliseconds

// With filters
const monthlyPeriod = getBillingPeriod({
  customer,
  interval: "month",
});

const entityPeriod = getBillingPeriod({
  customer,
  entityIndex: 0,
});
```

## `calculateProration`

Calculate prorated amount for a single price (not the difference):

```typescript
import { calculateProration } from "@tests/integration/billing/utils/proration";

const proratedCharge = calculateProration({
  customer,
  advancedTo,
  amount: 50,  // Full price
});
// Returns prorated amount for remaining period
```

## Complete Example

```typescript
test.concurrent(`${chalk.yellowBright("mid-cycle upgrade with consumable arrear")}`, async () => {
  const customerId = "mid-cycle-upgrade-arrear";

  const proConsumable = items.consumableWords({ includedUsage: 200 });
  const pro = products.pro({ id: "pro", items: [proConsumable] });

  const premiumConsumable = items.consumableWords({ includedUsage: 1000 });
  const premium = products.premium({ id: "premium", items: [premiumConsumable] });

  const { autumnV1, advancedTo } = await initScenario({
    customerId,
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro, premium] }),
    ],
    actions: [
      s.billing.attach({ productId: pro.id }),
      s.track({ featureId: TestFeature.Words, value: 300 }), // 100 overage
      s.advanceTestClock({ days: 15 }),
    ],
  });

  // Get customer to extract billing period
  const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);

  // Calculate prorated base price difference
  const proratedBaseDiff = calculateProratedDiff({
    customer: customerBefore,
    advancedTo,
    oldAmount: 20, // Pro base price
    newAmount: 50, // Premium base price
  });

  // Consumable arrear is NOT prorated - full amount
  const arrearOverage = 5; // 100 overage × $0.05

  const expectedTotal = proratedBaseDiff + arrearOverage;

  // Preview
  const preview = await autumnV1.billing.previewAttach({
    customer_id: customerId,
    product_id: premium.id,
  });
  expect(preview.total).toBeCloseTo(expectedTotal, 0);

  // Attach
  await autumnV1.billing.attach({
    customer_id: customerId,
    product_id: premium.id,
    redirect_mode: "if_required",
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

  await expectCustomerProducts({
    customer,
    active: [premium.id],
    notPresent: [pro.id],
  });

  await expectCustomerInvoiceCorrect({
    customer,
    count: 2,
    latestTotal: preview.total,
  });
});
```

## Why Use These Utilities?

1. **Correct billing period**: Gets actual `current_period_start/end` from Stripe subscription (not estimated with `ms.days(30)`)
2. **Precision**: Uses `Decimal.js` internally - no floating point errors
3. **Auto-flooring**: Automatically floors `advancedTo` to match Stripe's frozen_time calculation
4. **Multi-subscription support**: Handles monthly/annual dual subscriptions, entity products, etc.

## Anti-Pattern (DON'T DO THIS)

```typescript
// ❌ BAD - estimating billing period manually
const periodStart = advancedTo - ms.days(15);
const periodEnd = periodStart + ms.days(30); // Wrong! Months vary

// ✅ GOOD - use the utility
const expectedTotal = calculateProratedDiff({
  customer: customerBefore,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
});
```
