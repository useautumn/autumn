# Expectation Utilities

## Table of Contents

- [Feature Expectations](#feature-expectations)
- [Invoice Expectations](#invoice-expectations)
- [Invoice Line Items](#invoice-line-items)
- [Product State Expectations](#product-state-expectations)
- [Product Item Expectations](#product-item-expectations)
- [Preview Expectations](#preview-expectations)
- [Subscription Verification](#subscription-verification)
- [Cache vs DB Verification](#cache-vs-db-verification)
- [Rollover Expectations](#rollover-expectations)
- [Error Testing](#error-testing)
- [Time Utilities](#time-utilities)

## Imports

```typescript
import { expectCustomerFeatureCorrect, expectCustomerFeatureExists } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts, expectProductActive, expectProductCanceling, expectProductScheduled, expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing, expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectInvoiceLineItemsCorrect, expectBasePriceLineItem, expectFeatureLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb";
import { expectProductItemCorrect, expectProductItemQuantity } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached, expectScheduledApiSub } from "@tests/utils/expectUtils/expectProductAttached";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
```

## Feature Expectations

### `expectCustomerFeatureCorrect`

Verify feature balance, usage, and limits.

**IMPORTANT: Does NOT fetch from API.** You must pass a fetched `customer` object. Passing only `customerId` silently returns undefined features.

```typescript
expectCustomerFeatureCorrect({
  customer,                        // ApiCustomerV3 or ApiEntityV0 — MUST be fetched object
  featureId: TestFeature.Messages,
  includedUsage?: 100,             // Expected included_usage
  balance?: 100,                   // Expected balance
  usage?: 0,                       // Expected usage
  resetsAt?: number,               // Expected next_reset_at timestamp (±10 min tolerance)
});
```

Works with both customers and entities:
```typescript
const entity = await autumnV1.entities.get(customerId, entityId);
expectCustomerFeatureCorrect({
  customer: entity,  // Entities work via `customer` param
  featureId: TestFeature.Messages,
  balance: 100,
});
```

### `expectCustomerFeatureExists`

Simple existence check.

```typescript
await expectCustomerFeatureExists({
  customer,         // Or customerId
  featureId: TestFeature.Dashboard,
});
```

## Invoice Expectations

### `expectCustomerInvoiceCorrect`

Verify invoice count and latest invoice details.

```typescript
expectCustomerInvoiceCorrect({
  customer,                     // ApiCustomerV3
  count: 2,                     // Total invoice count
  latestTotal?: 30,             // Most recent invoice total ($), ±$0.01 tolerance
  latestStatus?: "paid",        // "paid" | "draft" | "open" | "void"
  latestInvoiceProductId?: string, // Product ID on latest invoice
});
```

### Invoice Count Guidelines

| Transition | Expected Count |
|------------|---------------|
| Free-to-Free | 0 |
| Free-to-Paid | 1 |
| Paid-to-Paid (upgrade/downgrade) | Initial (1) + Update (1) = 2 |
| Add Trial to Paid | +1 (refund invoice) |
| Remove Trial | +1 (charge invoice) |
| Allocated track over limit | +1 per track |
| Prepaid update | +1 (refund) + 1 (charge) = 2 |
| Trial subscription created | 1 ($0 invoice) |

## Invoice Line Items

### `expectInvoiceLineItemsCorrect`

Full line item verification. Polls DB up to 10s for line items to appear.

```typescript
await expectInvoiceLineItemsCorrect({
  stripeInvoiceId: string,         // Stripe invoice ID
  expectedTotal?: number,          // Expected total amount
  expectedCount?: number,          // Expected number of line items
  allCharges?: boolean,            // Assert all items are charges
  allRefunds?: boolean,            // Assert all items are refunds
  expectedLineItems?: ExpectedLineItem[],  // Per-item expectations
  debug?: boolean,                 // Default: true — log details
});
```

`ExpectedLineItem` fields:
```typescript
{
  isBasePrice?: boolean,        // Filter: base price item
  featureId?: string,           // Filter: feature ID
  direction?: "charge" | "refund",
  billingTiming?: "in_advance" | "in_arrear",
  amount?: number,              // Per-unit amount
  totalAmount?: number,         // Total = amount * quantity
  count?: number,               // Exact count of matching items
  minCount?: number,            // At least this many matching items
  prorated?: boolean,
  productId?: string,
  stripeId?: string,
  stripeSubscriptionItemId?: string,
  stripeQuantity?: number,
  totalQuantity?: number,
  paidQuantity?: number,
  discount?: {
    amountAfterDiscounts?: number,
    totalAmountAfterDiscounts?: number,
    hasDiscounts?: boolean,
    discountCount?: number,
    discountAmountOff?: number,
    couponIds?: string[],
    stripeDiscountable?: boolean,
  },
}
```

Returns `DbInvoiceLineItem[]`.

### `expectBasePriceLineItem`

Shorthand for verifying a single base price line item.

```typescript
await expectBasePriceLineItem({
  stripeInvoiceId: string,
  amount?: number,                 // Expected amount
  direction?: "charge" | "refund", // Default: "charge"
  prorated?: boolean,
  productId?: string,
  debug?: boolean,
});
```

Returns single `DbInvoiceLineItem`.

### `expectFeatureLineItems`

Shorthand for verifying feature-specific line items.

```typescript
await expectFeatureLineItems({
  stripeInvoiceId: string,
  featureId: string,
  totalAmount?: number,
  totalQuantity?: number,
  direction?: "charge" | "refund",
  billingTiming?: "in_advance" | "in_arrear",
  minCount?: number,               // Default: 1
  debug?: boolean,
});
```

Returns matching `DbInvoiceLineItem[]`.

## Product State Expectations

### `expectCustomerProducts` (Batch — PREFERRED)

Verify multiple product states in a single call. **Always use when checking 2+ products.**

```typescript
await expectCustomerProducts({
  customer,                    // Or customerId
  active: [pro.id, addon.id],  // Active and NOT canceling
  canceling: [premium.id],     // Scheduled for cancellation (status:active + canceled_at set)
  scheduled: [free.id],        // Waiting to become active at cycle end
  notPresent: [oldProduct.id], // Should not exist
});
```

**CRITICAL:** `active` and `canceling` are **mutually exclusive**. A downgrading product is `canceling`, NOT `active`.

```typescript
// ✅ CORRECT
await expectCustomerProducts({
  customer,
  canceling: [pro.id],         // Pro is canceling, NOT active
  active: [recurringAddon.id],
  scheduled: [free.id],
});

// ❌ WRONG — pro cannot be both active and canceling
await expectCustomerProducts({
  customer,
  active: [pro.id, recurringAddon.id],  // WRONG
  canceling: [pro.id],
});
```

### Individual Product State Checks

```typescript
await expectProductActive({ customer, productId: pro.id });
await expectProductCanceling({ customer, productId: premium.id });   // Works with entities too
await expectProductScheduled({ customer, productId: pro.id });
await expectProductNotPresent({ customer, productId: pro.id });
```

### `expectProductTrialing` / `expectProductNotTrialing`

```typescript
import { ms } from "@autumn/shared";

await expectProductTrialing({
  customer,
  productId: pro.id,
  trialEndsAt: advancedTo + ms.days(7),  // Expected trial end timestamp
});

await expectProductNotTrialing({ customer, productId: pro.id });
```

### `expectProductAttached`

Generic product attachment check with status.

```typescript
import { CusProductStatus } from "@autumn/shared";

expectProductAttached({
  customer,
  product: pro,                          // ProductV2 object
  status?: CusProductStatus.Active,      // Default: Active
  entityId?: string,
});
```

### `expectScheduledApiSub`

Verify a scheduled subscription exists in API.

```typescript
await expectScheduledApiSub({
  customerId,
  entityId?: string,
  productId: pro.id,
});
```

## Product Item Expectations

### `expectProductItemCorrect`

Verify a product item's quantity and upcoming quantity.

```typescript
await expectProductItemCorrect({
  customerId?: string,
  customer?: ApiCustomerV3 | ApiEntityV0,
  productId: string,
  featureId: string,
  quantity?: number,
  upcomingQuantity?: number | "undefined",  // "undefined" asserts it's not set
});
```

### `expectProductItemQuantity`

Shorthand — same as `expectProductItemCorrect` with `upcomingQuantity: "undefined"`.

```typescript
await expectProductItemQuantity({
  customer, productId: pro.id, featureId: TestFeature.Messages, quantity: 200,
});
```

## Preview Expectations

### `expectPreviewNextCycleCorrect`

Verify subscription preview next cycle info.

```typescript
// When next_cycle should exist
expectPreviewNextCycleCorrect({
  preview,
  startsAt: addMonths(advancedTo, 1).getTime(),  // Use addMonths, not ms.days(30)
  total: 50,
});

// When next_cycle should NOT exist
expectPreviewNextCycleCorrect({
  preview,
  expectDefined: false,
});
```

## Subscription Verification

**ALWAYS verify Stripe subscription state after EVERY billing action!**

### `expectStripeSubscriptionCorrect` (PREFERRED for new tests)

Verifies Stripe subscriptions match expected state derived from customer products. Handles inline prices, schedules, cancellation.

```typescript
await expectStripeSubscriptionCorrect({
  ctx,                          // TestContext from initScenario
  customerId,
  options?: {
    subCount?: number,          // Expected total subscription count
    subId?: string,             // Verify a specific subscription only
    status?: "active" | "trialing",
    shouldBeCanceling?: boolean,
    rewards?: string[],         // Expected coupon/discount IDs
    debug?: boolean,            // Log detailed comparison info
  },
});
```

Key features:
- Matches inline items by `autumn_customer_price_id` metadata
- Validates `unit_amount_decimal` on inline prices
- Validates schedule phases (multi_phase scenarios)
- Works with entity-scoped prepaid products

### `expectSubToBeCorrect` (Legacy)

Deep verification of subscription state in database. **Use for existing tests only.**

```typescript
await expectSubToBeCorrect({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
  entityId?: string,
  subCount?: number,
  flags: {
    checkNotTrialing?: true,
    checkTrialing?: true,
  },
});
```

### `expectNoStripeSubscription`

Verify customer has no active Stripe subscriptions. **Use for free products or after downgrading to free.**

```typescript
await expectNoStripeSubscription({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
});
```

### When to Use Which

| Scenario | Utility |
|----------|---------|
| New test with paid product | `expectStripeSubscriptionCorrect` |
| Entity-scoped inline prices | `expectStripeSubscriptionCorrect` |
| Existing test (don't change) | `expectSubToBeCorrect` |
| Free product / downgrade to free | `expectNoStripeSubscription` |
| Scheduled downgrade (before cycle) | `expectStripeSubscriptionCorrect` (validates schedule phases) |

## Cache vs DB Verification

### `expectFeatureCachedAndDb`

Fetches customer from cache AND DB (`skip_cache: "true"`), asserts feature balance + usage match on both.

```typescript
await expectFeatureCachedAndDb({
  autumn: autumnV1,
  customerId,
  featureId: TestFeature.Messages,
  balance: 90,
  usage: 10,
});
```

## Invoice Amount Calculation

### `calculateExpectedInvoiceAmount`

Pure calculation from ProductItem[] — no DB/Stripe calls. Handles fixed prices, consumable overage, prepaid, tiered pricing, and proration.

```typescript
const expected = calculateExpectedInvoiceAmount({
  items: [priceItem, messagesItem],
  usage?: [{ featureId: TestFeature.Messages, value: 150 }],
  proration?: {
    billingPeriod: { start: number; end: number },
    now: number,
    applyTo?: "fixed" | "all",
  },
  options?: {
    includeFixed?: boolean,   // Default: true
    includeUsage?: boolean,   // Default: true
    onlyArrear?: boolean,     // Default: false
  },
});
```

## Rollover Expectations

### `expectCustomerRolloverCorrect`

```typescript
import { expectCustomerRolloverCorrect, expectNoRollovers } from "@tests/integration/billing/utils/rollover/expectCustomerRolloverCorrect";

expectCustomerRolloverCorrect({
  customer,
  featureId: TestFeature.Messages,
  expectedRollovers: [{ balance: 150 }],
  totalBalance: 550,
});

expectNoRollovers({
  customer,
  featureId: TestFeature.Messages,
});
```

## Error Testing

### `expectAutumnError`

```typescript
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { ErrCode } from "@autumn/shared";

await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: () => autumnV1.customers.get("invalid-id"),
});
```

## Time Utilities

```typescript
import { ms } from "@autumn/shared";

ms.days(7)      // 7 days in milliseconds
ms.hours(2)     // 2 hours in milliseconds
ms.minutes(30)  // 30 minutes in milliseconds
```
