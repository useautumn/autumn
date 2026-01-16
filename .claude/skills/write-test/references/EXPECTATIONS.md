# Expectation Utilities

## Imports

```typescript
import { expectCustomerFeatureCorrect, expectCustomerFeatureExists } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing, expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached, expectScheduledApiSub } from "@tests/utils/expectUtils/expectProductAttached";
```

## Feature Expectations

### `expectCustomerFeatureCorrect`

Verify feature balance, usage, and limits.

```typescript
expectCustomerFeatureCorrect({
  customer,                        // ApiCustomerV3 or ApiEntityV0
  featureId: TestFeature.Messages,
  includedUsage?: 100,             // Expected included_usage
  balance?: 100,                   // Expected balance
  usage?: 0,                       // Expected usage
  resetsAt?: number,               // Expected next_reset_at timestamp (±10 min tolerance)
});
```

**Works with both customers and entities:**
```typescript
const entity = await autumnV1.entities.get(customerId, entityId);
expectCustomerFeatureCorrect({
  customer: entity,  // Entities work too!
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
  customer,                     // ApiCustomerV3 (or customerId)
  count: 2,                     // Total invoice count
  latestTotal?: 30,             // Most recent invoice total ($)
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

## Product State Expectations

### `expectProductActive`

Verify product is active for customer/entity.

```typescript
await expectProductActive({
  customer,
  productId: pro.id,
});
```

### `expectProductTrialing`

Verify product is in trial state.

```typescript
import { ms } from "@autumn/shared";

await expectProductTrialing({
  customer,
  productId: pro.id,
  trialEndsAt: advancedTo + ms.days(7),  // Expected trial end timestamp
});
```

### `expectProductNotTrialing`

Verify product is NOT in trial.

```typescript
await expectProductNotTrialing({
  customer,
  productId: pro.id,
});
```

### `expectProductAttached`

Generic product attachment check with status.

```typescript
import { CusProductStatus } from "@autumn/shared";

expectProductAttached({
  customer,
  product: pro,                          // ProductV2 object
  status?: CusProductStatus.Active,      // Default: Active
  entityId?: string,                     // For entity-level check
});

// For scheduled products (downgrades)
expectProductAttached({
  customer: entity,
  product: free,
  status: CusProductStatus.Scheduled,
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

## Preview Expectations

### `expectPreviewNextCycleCorrect`

Verify subscription preview next cycle info.

```typescript
// When next_cycle should exist
expectPreviewNextCycleCorrect({
  preview,
  startsAt: advancedTo + ms.days(14),  // When next cycle starts
  total: 50,                            // Expected next cycle charge
});

// When next_cycle should NOT exist (e.g., trial removed)
expectPreviewNextCycleCorrect({
  preview,
  expectDefined: false,
});
```

## Subscription Verification

### `expectSubToBeCorrect`

Deep verification of subscription state in database.

```typescript
await expectSubToBeCorrect({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
  entityId?: string,        // For entity-level subscription
  subCount?: number,        // Expected subscription count
  flags: {
    checkNotTrialing?: true,
    checkTrialing?: true,
    // Other flags as needed
  },
});
```

## Complete Example

```typescript
test.concurrent(`${chalk.yellowBright("trial: full lifecycle")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const priceItem = items.monthlyPrice({ price: 20 });
  const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

  const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
    customerId: "trial-lifecycle",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro] }),
    ],
    actions: [s.attach({ productId: pro.id })],
  });

  // Initial state: paid, not trialing
  const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  
  await expectProductActive({ customer: customerBefore, productId: pro.id });
  await expectProductNotTrialing({ customer: customerBefore, productId: pro.id });
  
  expectCustomerFeatureCorrect({
    customer: customerBefore,
    featureId: TestFeature.Messages,
    includedUsage: 100,
    balance: 100,
    usage: 0,
  });

  expectCustomerInvoiceCorrect({
    customer: customerBefore,
    count: 1,
    latestTotal: 20,
  });

  // Add trial
  await autumnV1.subscriptions.update({
    customer_id: customerId,
    product_id: pro.id,
    free_trial: { length: 14, duration: FreeTrialDuration.Day, card_required: true },
  });

  const customerWithTrial = await autumnV1.customers.get<ApiCustomerV3>(customerId);

  await expectProductTrialing({
    customer: customerWithTrial,
    productId: pro.id,
    trialEndsAt: advancedTo + ms.days(14),
  });

  // Invoice: initial + refund = 2
  expectCustomerInvoiceCorrect({
    customer: customerWithTrial,
    count: 2,
    latestTotal: -20,  // Refund
  });

  // Remove trial
  await autumnV1.subscriptions.update({
    customer_id: customerId,
    product_id: pro.id,
    free_trial: null,
  });

  const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

  await expectProductNotTrialing({ customer: customerAfter, productId: pro.id });
  await expectProductActive({ customer: customerAfter, productId: pro.id });

  // Invoice: initial + refund + charge = 3
  expectCustomerInvoiceCorrect({
    customer: customerAfter,
    count: 3,
    latestTotal: 20,
  });

  // Verify subscription state in DB
  await expectSubToBeCorrect({
    db: ctx.db,
    customerId,
    org: ctx.org,
    env: ctx.env,
    flags: { checkNotTrialing: true },
  });
});
```

## Time Utilities

```typescript
import { ms } from "@autumn/shared";

ms.days(7)      // 7 days in milliseconds
ms.hours(2)     // 2 hours in milliseconds
ms.minutes(30)  // 30 minutes in milliseconds

// Usage
const trialEnd = advancedTo + ms.days(14);
```
