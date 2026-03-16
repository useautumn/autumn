# Track and Check Endpoint Testing

## Overview

| Endpoint | Purpose | Modifies Data |
|----------|---------|---------------|
| `/check` | Validate feature access, get balance | No |
| `/track` | Record usage, deduct from balance | Yes |

## The `/check` Endpoint

### Parameters
- `customer_id` (required) - Customer to check
- `feature_id` (required) - Feature to check access for
- `required_balance` (optional) - Amount needed (default: 1)

### Basic Usage
```typescript
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  required_balance: 100,
});

expect(res.allowed).toBe(true);
expect(res.balance).toBe(1000);
expect(res.required_balance).toBe(100);
expect(res.usage).toBe(0);
expect(res.included_usage).toBe(1000);
```

### v0 vs v1 Response Formats

**v0 Response:**
```typescript
const res = await autumnV0.check({...}) as CheckResponseV0;

expect(res.allowed).toBe(true);
expect(res.balances).toHaveLength(1);
expect(res.balances[0]).toMatchObject({
  feature_id: TestFeature.Messages,
  balance: 1000,
  required: 100,
});
```

**v1 Response:**
```typescript
const res = await autumnV1.check({...}) as CheckResponse;

expect(res).toMatchObject({
  allowed: true,
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  balance: 1000,
  required_balance: 100,
  code: SuccessCode.FeatureFound,
  usage: 0,
  included_usage: 1000,
  overage_allowed: false,
});
expect(res.next_reset_at).toBeDefined();
```

## The `/track` Endpoint

### Parameters
- `customer_id` (required) - Customer to track usage for
- `feature_id` OR `event_name` (required) - Feature or event to track
- `value` (optional) - Amount to track (default: 1)
- `entity_id` (optional) - For entity-scoped tracking

### Basic Usage
```typescript
await autumnV1.track({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  value: 10,
});

const customer = await autumnV1.customers.get(customerId);
expect(customer.features[TestFeature.Messages].balance).toBe(90);
expect(customer.features[TestFeature.Messages].usage).toBe(10);
```

## Critical: Use Decimal.js for Balance Calculations

**Floating point errors are common!** Always use `Decimal` for calculations:

```typescript
import { Decimal } from "decimal.js";

// WRONG - Floating point error risk
expect(balance).toBe(100 - 23.47);

// CORRECT - Use Decimal
const expectedBalance = new Decimal(100).sub(23.47).toNumber();
expect(balance).toBe(expectedBalance);
```

## Event-Based Tracking

Track multiple features with one event:

```typescript
// Both Action1 and Action2 listen to "action-event"
await autumnV1.track({
  customer_id: customerId,
  event_name: "action-event",  // Triggers BOTH features
  value: 10,
});

const customer = await autumnV1.customers.get(customerId);
// Both features deducted
expect(customer.features[TestFeature.Action1].balance).toBe(
  new Decimal(200).sub(10).toNumber()
);
expect(customer.features[TestFeature.Action2].balance).toBe(
  new Decimal(150).sub(10).toNumber()
);
```

## Credit Systems

### Key Concept

Credit systems are pools that multiple actions can consume from. Actions have a `credit_cost` multiplier.

**TestFeature schema:**
- `Action1` → consumes from `Credits` with `credit_cost = 0.2`
- `Action2` → consumes from `Credits` with `credit_cost = 0.6`
- `Action3` → consumes from `Credits2` with `credit_cost = 1.4`

### Check on Actions, Not Credits

```typescript
// WRONG - Don't check Credits directly
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Credits,  // Wrong!
});

// CORRECT - Check the action, response includes Credits balance
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Action1,
  required_balance: 50,
});
expect(res.allowed).toBe(true);
expect(res.balance).toBe(100);  // Shows Credits balance
```

### Deduction Order

When tracking an action that has both a direct balance AND a credit system fallback:

1. **First:** Deducts from the action's direct balance
2. **Then:** When depleted, falls back to credit system (with `credit_cost` multiplier)

```typescript
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

// Setup: action1 (100) + credits (200), credit_cost = 0.2

// Track 40 → only action1 affected
await autumnV1.track({
  customer_id: customerId,
  feature_id: TestFeature.Action1,
  value: 40,
});
// action1: 60, credits: 200 (untouched)

// Track 80 → finishes action1 (60 remaining), uses credits for overflow (20)
await autumnV1.track({
  customer_id: customerId,
  feature_id: TestFeature.Action1,
  value: 80,
});

// Calculate credit cost for overflow
const creditFeature = ctx.features.find(f => f.id === TestFeature.Credits);
const creditCost = getCreditCost({
  featureId: TestFeature.Action1,
  creditSystem: creditFeature!,
  amount: 20,  // overflow amount
});

// action1: 0, credits: 200 - creditCost
expect(customer.features[TestFeature.Action1].balance).toBe(0);
expect(customer.features[TestFeature.Credits].balance).toBe(
  new Decimal(200).sub(creditCost).toNumber()
);
```

### getCreditCost Utility

```typescript
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

const cost = getCreditCost({
  featureId: TestFeature.Action1,
  creditSystem: creditFeature,
  amount: 50,
});
// If credit_cost = 0.2, cost = 50 * 0.2 = 10 credits
```

## Cache vs Database Verification

After tracking, verify both cached and database state:

```typescript
test("should update both cache and database", async () => {
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: 10,
  });

  // Check cached (immediate)
  const cached = await autumnV1.customers.get(customerId);
  expect(cached.features[TestFeature.Messages].balance).toBe(90);

  // Wait for DB sync
  await new Promise(r => setTimeout(r, 2000));

  // Check database (skip cache)
  const fromDb = await autumnV1.customers.get(customerId, {
    skip_cache: "true",
  });
  expect(fromDb.features[TestFeature.Messages].balance).toBe(90);
});
```

## Concurrent Request Testing

Track handles concurrent requests with SQL-level atomicity:

```typescript
test("should handle concurrent requests", async () => {
  const promises = Array(5).fill(null).map(() =>
    autumnV1.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: 10,
    })
  );

  await Promise.all(promises);

  const customer = await autumnV1.customers.get(customerId);
  // All 5 requests should be atomic: 100 - 50 = 50
  expect(customer.features[TestFeature.Messages].balance).toBe(50);
  expect(customer.features[TestFeature.Messages].usage).toBe(50);
});
```

## Multiple Products Gotchas

### Unique Product IDs Required

```typescript
// WRONG - Same default ID
const prod1 = constructProduct({ type: "free", items: [feature1] });
const prod2 = constructProduct({ type: "free", items: [feature2] });

// CORRECT - Unique IDs
const prod1 = constructProduct({ type: "free", id: "prod1", items: [feature1] });
const prod2 = constructProduct({ type: "free", id: "prod2", items: [feature2] });
```

### Second Product Needs `isAddOn: true`

Without `isAddOn: true`, attaching a second product **replaces** the first:

```typescript
// WRONG - prod2 replaces prod1
const prod1 = constructProduct({ type: "free", id: "prod1", ... });
const prod2 = constructProduct({ type: "free", id: "prod2", ... });

// CORRECT - prod2 is an add-on
const prod1 = constructProduct({ type: "free", id: "prod1", ... });
const prod2 = constructProduct({ type: "free", id: "prod2", isAddOn: true, ... });
```

## Lifetime/One-Off Reset Format

For features with no reset interval, the `reset` object is NOT `null`:

```typescript
// WRONG
expect(breakdown).toMatchObject({ reset: null });

// CORRECT
expect(breakdown).toMatchObject({
  reset: {
    interval: "one_off",
    resets_at: null,
  },
});
```

## Required Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import {
  ApiVersion,
  type CheckResponse,
  type CheckResponseV0,
  type LimitedItem,
  SuccessCode,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import {
  constructFeatureItem,
  constructArrearItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
```

## Test Checklist

### /check Tests
- [ ] Test both v0 and v1 response formats
- [ ] Test `allowed: true` and `allowed: false` cases
- [ ] Test `required_balance` parameter
- [ ] For credit systems: check Action, verify Credits balance in response
- [ ] Verify `next_reset_at` is defined for time-based features

### /track Tests
- [ ] Use `Decimal.js` for ALL balance calculations
- [ ] Use random decimal values (23.47, 37.89) for robustness
- [ ] Test initial balance before tracking
- [ ] Test both `feature_id` and `event_name` approaches
- [ ] Verify both `balance` and `usage` fields
- [ ] Test concurrent requests
- [ ] Verify both cached and non-cached customer (with 2s delay)
- [ ] For credit systems: use `getCreditCost`, test deduction order
