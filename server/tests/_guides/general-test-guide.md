# General Test Guide

## Test Context

All tests have access to `ctx` which contains:
- `ctx.org` - Test organization
- `ctx.db` - Database connection
- `ctx.features` - Organization features

## Initializing Autumn Clients

### Secret Key (Default)
```typescript
const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
```

### Public Key
```typescript
const autumnPublic = new AutumnInt({
  version: ApiVersion.V1_2,
  secretKey: ctx.org.test_pkey!,
});
```

### With Custom Config
```typescript
const autumn = new AutumnInt({
  version: ApiVersion.V1_2,
  orgConfig: { include_past_due: true },
});
```

## API Versions

- `ApiVersion.V0_2` - Legacy v0 API
- `ApiVersion.V1_2` - Current v1 API

## Common Test Patterns

### Product IDs - Use Variable References, Not Hardcoded Strings

When using `initScenario`, products are automatically prefixed with the `customerId`. **Always use the product variable's `.id` property** instead of hardcoding strings - both in `s.attach()`/`s.cancel()` helpers AND in direct API calls:

```typescript
const pro = products.pro({ id: "pro", items: [messagesItem] });
const premium = constructProduct({ id: "premium", items: [...], type: "premium" });

const { autumnV1, ctx, entities } = await initScenario({
  customerId,
  setup: [
    s.products({ list: [pro, premium] }),
  ],
  actions: [
    // ✅ GOOD - Use product.id in s.attach/s.cancel
    s.attach({ productId: pro.id, entityIndex: 0 }),
    s.attach({ productId: premium.id, entityIndex: 1 }),
    s.cancel({ productId: pro.id, entityIndex: 0 }),
  ],
});

// ✅ GOOD - Use product variable's .id in direct API calls
await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,  // Returns prefixed ID like "pro_my-test"
  entity_id: entities[0].id,
});

await expectProductActive({
  customer: customerData,
  productId: premium.id,  // Use variable reference
});

// ❌ BAD - Don't hardcode product IDs as strings
s.attach({ productId: "pro", entityIndex: 0 });  // Avoid strings
await autumnV1.attach({
  customer_id: customerId,
  product_id: `pro_${customerId}`,  // Avoid hardcoding
  entity_id: entities[0].id,
});
```

**Why use `product.id`?** The product objects are mutated by `initScenario` to include the prefix. Using `product.id` ensures you always get the correctly prefixed ID and makes refactoring easier.

### Wait for Async Processing
```typescript
await new Promise((resolve) => setTimeout(resolve, 2000));
```

### Get Customer with Feature Balance
```typescript
const customer: any = await autumn.customers.get(customerId);
const balance = customer.features[TestFeature.Messages].balance;
const used = customer.features[TestFeature.Messages].used;
```

### Expect Error (Use This Instead of try-catch!)

**Always use `expectAutumnError` instead of manual try-catch blocks:**

```typescript
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";

// ✅ GOOD - Use expectAutumnError
await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: async () => {
    await autumn.customers.get("invalid-id");
  },
});

// ✅ GOOD - Test for duplicate idempotency key
await expectAutumnError({
  errCode: ErrCode.DuplicateIdempotencyKey,
  func: async () => {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      idempotency_key: "same-key",
    });
  },
});

// ❌ BAD - Don't use try-catch
let errorThrown = false;
try {
  await autumn.customers.get("invalid-id");
} catch (error) {
  errorThrown = true;
}
expect(errorThrown).toBe(true);
```

**Common Error Codes:**
- `ErrCode.CustomerNotFound`
- `ErrCode.ProductNotFound`
- `ErrCode.FeatureNotFound`
- `ErrCode.InsufficientBalance`
- `ErrCode.DuplicateIdempotencyKey`
- `ErrCode.InvalidRequest`

## Public Key Restrictions

Public keys can only access:
- `GET /v1/products`
- `POST /v1/entitled`
- `POST /v1/check`
- `POST /v1/attach`
- `GET /v1/customers/:customerId`

Public keys CANNOT:
- Send events (`send_event: true` is silently ignored)
- Access other endpoints

## Test Organization

- `beforeAll` - Setup (create customers, products, attach)
- `test` - Individual test cases
- Use descriptive test names with `chalk.yellowBright()`

## Customer Initialization

### Payment Methods
**IMPORTANT:** If your product has ANY price (overage, per-seat, usage-based, etc.), you MUST attach a payment method:

```typescript
// ✅ GOOD - Product with prices requires payment method
await initCustomerV3({
  ctx,
  customerId,
  attachPm: "success",  // Required for any paid features
  withTestClock: false,
});

// ❌ BAD - Product with prices but no payment method
await initCustomerV3({
  ctx,
  customerId,
  withTestClock: false,  // Missing attachPm: "success"
});
```

Use `attachPm: "success"` when:
- Product has overage pricing (arrear items)
- Product has per-seat pricing
- Product has usage-based billing
- Any feature can trigger billing

Omit `attachPm` only for:
- Completely free products (no prices at all)
- Tests that don't require billing

## Constructing Feature Items

### Lifetime (One-off) Features
For lifetime features that never reset, pass `interval: null`:

```typescript
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// ✅ GOOD - Lifetime feature (no reset)
const lifetimeMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 200,
  interval: null,  // null = lifetime/one-off
});

// Monthly feature (default)
const monthlyMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 100,
  // interval defaults to ProductItemInterval.Month
});
```

**Note:** `interval: null` is different from `ProductItemInterval.Lifetime`. Use `null` when constructing feature items for lifetime balances.

### Finding Lifetime/One-off Breakdowns in Check Response

When querying breakdowns from a check response, lifetime features return `ResetInterval.OneOff`:

```typescript
import { ResetInterval } from "@autumn/shared";

const checkRes = await autumnV2.check<CheckResponseV2>({
  customer_id: customerId,
  entity_id: entityId,
  feature_id: TestFeature.Messages,
});

// ✅ GOOD - Use ResetInterval enum values
const monthlyBreakdown = checkRes.balance?.breakdown?.find(
  (b) => b.reset?.interval === ResetInterval.Month,
);
const lifetimeBreakdown = checkRes.balance?.breakdown?.find(
  (b) => b.reset?.interval === ResetInterval.OneOff,
);

// ❌ BAD - Don't use null or string literals
const lifetimeWrong1 = checkRes.balance?.breakdown?.find(
  (b) => b.reset?.interval === null,  // Won't match - API returns "one_off"
);
const monthlyWrong = checkRes.balance?.breakdown?.find(
  (b) => b.reset?.interval === "month",  // Use ResetInterval.Month instead
);
```

## Prepaid Products

### Attaching Prepaid Products Requires Quantity
When attaching a prepaid product, you **must** pass the `options` array with a `quantity` for each prepaid feature:

```typescript
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

// Define prepaid item (includedUsage: 0 means all credits come from purchase)
const prepaidMessagesItem = constructPrepaidItem({
  featureId: TestFeature.Messages,
  includedUsage: 0,  // No free credits - goes to granted_balance
  price: 9,          // $9 per billing unit
  billingUnits: 100, // 100 credits per unit
});

const prepaidProd = constructProduct({
  type: "free",
  id: "prepaid-prod",
  isAddOn: true,
  items: [prepaidMessagesItem],
});

// ✅ GOOD - Attach with quantity option
await autumnV2.attach({
  customer_id: customerId,
  product_id: prepaidProd.id,
  options: [
    {
      feature_id: TestFeature.Messages,
      quantity: 50,  // Purchase 50 credits
    },
  ],
});

// ❌ BAD - Missing options for prepaid product
await autumnV2.attach({
  customer_id: customerId,
  product_id: prepaidProd.id,
  // Will fail or have no credits allocated
});
```

### Prepaid Quantity is Rounded to Nearest Billing Units

**IMPORTANT:** The `quantity` you request is **rounded up to the nearest billing unit**:

```typescript
// With billingUnits: 100 and quantity: 50:
// - Rounds UP to 100 (the nearest billing unit)
// - You get 100 credits, not 50!

// With billingUnits: 100 and quantity: 150:
// - Rounds UP to 200
// - You get 200 credits

// To get exactly 50 credits, use billingUnits: 1 or billingUnits: 50
```

### Prepaid Quantity Goes to `purchased_balance`, NOT `granted_balance`

When attaching a prepaid product with a quantity option, the purchased credits go to `purchased_balance`, not `granted_balance`:

```typescript
// With includedUsage: 0, billingUnits: 100, and quantity: 50:
// - Quantity rounds UP to 100 (nearest billing unit)
// - granted_balance: 0  (from includedUsage)
// - purchased_balance: 100 (rounded quantity)
// - current_balance: 100 (granted + purchased)

const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
expect(customer.balances[TestFeature.Messages]).toMatchObject({
  granted_balance: 0,       // Only includedUsage contributes here
  purchased_balance: 100,   // Rounded quantity goes HERE
  current_balance: 100,     // Total available = granted + purchased
  usage: 0,
});
```

**Balance breakdown:**
- `granted_balance` = sum of all `includedUsage` values across products
- `purchased_balance` = sum of all purchased quantities (rounded to billing units)
- `current_balance` = `granted_balance` + `purchased_balance` - `usage`

**Pricing Note:** With `billingUnits: 100` and `price: 9`, purchasing `quantity: 50` rounds to 100 credits and costs $9.00 (1 billing unit × $9).

## Interval Filters

### Filtering Balance Updates by Interval

When updating balances with `autumnV2.balances.update()`, you can filter by interval to target specific breakdown items:

```typescript
import { ResetInterval } from "@autumn/shared";

// Update only monthly breakdowns
await autumnV2.balances.update({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  current_balance: 75,
  interval: ResetInterval.Month,  // Only affects monthly breakdown items
});

// Update only lifetime breakdowns
await autumnV2.balances.update({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  current_balance: 150,
  interval: ResetInterval.OneOff,  // Only affects lifetime breakdown items
});
```

### Lifetime Interval Value

**IMPORTANT:** Lifetime/one-off breakdowns use `"one_off"` as their interval value in API responses, not `null`:

```typescript
// API response structure for lifetime breakdown:
{
  "reset": {
    "interval": "one_off",  // NOT null!
    "resets_at": null
  }
}
```

When finding breakdowns in test assertions:

```typescript
// ✅ GOOD - Use "one_off" string or ResetInterval.OneOff
const lifetimeBreakdown = res.balance?.breakdown?.find(
  (b) => b.reset?.interval === "one_off",
);

// ❌ BAD - null won't match
const lifetimeWrong = res.balance?.breakdown?.find(
  (b) => b.reset?.interval === null,  // Won't find lifetime breakdowns!
);
```

**Note:** The interval filter in `balances.update` handles both representations - `ResetInterval.OneOff` will match breakdowns where `reset.interval` is `"one_off"` OR where `reset` is `null`.

## Product States After Downgrade

When a customer downgrades from Product A to Product B:
- **Product A** enters "canceling" state: `status: "active"` but `canceled_at` is set
- **Product B** enters "scheduled" state: `status: "scheduled"`

After the billing cycle ends:
- **Product A** is removed (or becomes expired)
- **Product B** becomes "active"

```typescript
// After downgrade from Premium to Pro:
await expectProductCanceling({ customer, productId: premium.id });  // Old product
await expectProductScheduled({ customer, productId: pro.id });       // New product

// After billing cycle completes:
await expectProductNotPresent({ customer, productId: premium.id });
await expectProductActive({ customer, productId: pro.id });
```

**Note:** "Canceling" means the product is still active and usable, but is scheduled to end at the next billing cycle.

## Trial Testing Utilities

### Checking Product Trial State

Use `expectProductTrialing` and `expectProductNotTrialing` to verify trial state:

```typescript
import {
  expectProductTrialing,
  expectProductNotTrialing,
  expectFeatureResetAlignedWithTrialEnd,
} from "@tests/billing/utils/expectCustomerProductTrialing";

// Verify product is trialing and get trial end time
// Verify product is trialing with expected trial end (10 min tolerance)
const trialEndsAt = await expectProductTrialing({
  customer,
  productId: product.id,
  trialEndsAt: Date.now() + ms.days(7),  // Expected trial end
});

// Or check against a previously captured timestamp
await expectProductTrialing({
  customer,
  productId: product.id,
  trialEndsAt: initialTrialEnd,
});

// Verify product is NOT trialing
await expectProductNotTrialing({
  customer,
  productId: product.id,
});

// Verify feature reset aligns with trial end
await expectFeatureResetAlignedWithTrialEnd({
  customer,
  featureId: TestFeature.Messages,
  trialEndsAt: trialEndsAt!,
});
```

### Checking Preview next_cycle Field

Use `expectPreviewNextCycleCorrect` to verify the `next_cycle` field in subscription update previews:

```typescript
import { expectPreviewNextCycleCorrect } from "@tests/billing/utils/expectPreviewNextCycleCorrect";

const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

// For paid products: check next_cycle is set with expected values
expectPreviewNextCycleCorrect({
  preview,
  startsAt: ms.days(7),        // Expected offset from now (1 day tolerance)
  total: priceItem.price!,     // Expected total in dollars
});

// For free-to-free updates: next_cycle should NOT be defined
expectPreviewNextCycleCorrect({
  preview,
  expectDefined: false,
});
```

**Note:** Free-to-free updates don't have `next_cycle` since there's no billing cycle.

### Feature Assertions with Reset Time

Use `resetsAt` in `expectCustomerFeatureCorrect` to verify the reset cycle anchor:

```typescript
expectCustomerFeatureCorrect({
  customer,
  featureId: TestFeature.Messages,
  includedUsage: 200,
  balance: 200,
  usage: 0,
  resetsAt: initialResetAt,  // Verify reset time hasn't changed (10 min tolerance)
});
```

### Common Trial Test Patterns

```typescript
// 1. Get initial state before update
const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);
const initialTrialEnd = await expectProductTrialing({
  customer: customerBefore,
  productId: product.id,
});
const initialResetAt = customerBefore.features[TestFeature.Messages].next_reset_at;

// 2. Advance time mid-trial
await advanceTestClock({
  stripeCli: ctx.stripeCli,
  testClockId: testClockId!,
  numberOfDays: 5,
});

// 3. Perform update and verify preview
const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
expectPreviewNextCycleCorrect({
  preview,
  startsAt: ms.days(9),  // 14 - 5 = 9 days remaining
  total: priceItem.price!,
});

// 4. Execute update
await autumnV1.subscriptions.update(updateParams);

// 5. Verify trial preserved/extended/removed
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
const newTrialEnd = await expectProductTrialing({
  customer,
  productId: product.id,
});
expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(ms.minutes(5));
```

## Free-to-Free Tests Don't Need Subscription Checks

When testing free-to-free product updates, **skip `expectSubToBeCorrect`** since there's no Stripe subscription for free products:

```typescript
// ✅ GOOD - Free-to-free test, no subscription check needed
expectCustomerFeatureCorrect({
  customer,
  featureId: TestFeature.Messages,
  includedUsage: 200,
  balance: 200,
  usage: 0,
});
// No expectSubToBeCorrect needed for free products

// ✅ GOOD - Free-to-paid test, subscription check needed
await expectSubToBeCorrect({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
});
```

**When to use `expectSubToBeCorrect`:**
- Free-to-paid upgrades
- Paid-to-paid updates
- Any scenario involving Stripe subscriptions

**When to skip:**
- Free-to-free updates (no Stripe subscription exists)

## Common Pitfalls

### Wait for Sync Before Attach (after Track)

`track` updates Redis immediately but syncs to Postgres **asynchronously**. `attach` rebuilds the customer cache from Postgres. If you call them back-to-back, the cache gets stale data.

```typescript
// ❌ BAD
await autumnV2.track({ ... });
await autumnV2.attach({ ... });  // Cache rebuilt from stale Postgres

// ✅ GOOD
await autumnV2.track({ ... });
await timeout(2000);
await autumnV2.attach({ ... });
```

Not an issue if you attach all products in `beforeAll` before any tracking.

## Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
```

