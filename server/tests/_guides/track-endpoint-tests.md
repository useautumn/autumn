# Guide: Writing /track Endpoint Tests

## What is /track?

The `/track` endpoint records usage for metered features and deducts from customer balances.

**Parameters:**
- `customer_id` (required) - The customer to track usage for
- `feature_id` OR `event_name` (required) - The feature or event to track
- `value` (optional) - The amount to track (defaults to 1)
- `entity_id` (optional) - For entity-scoped features

**Behavior:** 
- Deducts from customer balances
- Returns synchronously (no need for timeouts)
- Supports credit systems with automatic fallback
- Handles concurrent requests with SQL-level atomicity

## Step-by-Step: Writing a /track Test

### Step 1: Define What You're Testing

Identify the specific scenario:
- Basic metered feature deduction
- Credit system deduction
- Event-based tracking (multiple features from one event)
- Deduction order (feature → credit system)
- Concurrent track requests
- Balance capping (stop at 0 vs allow negative)
- Entity-scoped tracking

### Step 2: Construct Features & Products

#### Feature Types

**Basic Metered Features**:
```typescript
const messagesFeature = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 100,
});
```

**Event-Based Features** (multiple features triggered by one event):
```typescript
// Both action1 and action2 listen to "action-event"
const action1Feature = constructFeatureItem({
  featureId: TestFeature.Action1,
  includedUsage: 200,
});

const action2Feature = constructFeatureItem({
  featureId: TestFeature.Action2,
  includedUsage: 150,
});
```

**Credit Systems** (fallback pool for actions):
```typescript
const creditsFeature = constructFeatureItem({
  featureId: TestFeature.Credits,
  includedUsage: 100,
}) as LimitedItem;

// Action1 consumes from Credits with credit_cost = 0.2
// Action2 consumes from Credits with credit_cost = 0.6
```

#### Combine into Products

```typescript
const freeProd = constructProduct({
  type: "free",
  isDefault: false,
  items: [messagesFeature, creditsFeature],
});
```

### Step 3: Initialize Test Environment

**Always use this exact order in `beforeAll`:**

```typescript
import { Decimal } from "decimal.js";

const testCase = "track-basic1";
const customerId = "track-basic1";

beforeAll(async () => {
  // 1. Create customer
  await initCustomerV3({
    ctx,
    customerId,
    withTestClock: false,
  });

  // 2. Create products
  await initProductsV0({
    ctx,
    products: [freeProd],
    prefix: testCase,
  });

  // 3. Attach product to customer
  await autumnV1.attach({
    customer_id: customerId,
    product_id: freeProd.id,
  });
});
```

### Step 4: Write Test Cases

**IMPORTANT: Use Decimal for balance calculations to avoid floating point errors**

```typescript
test("should deduct exact value provided", async () => {
  const initialBalance = 100;
  const deductValue = 23.47;

  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: deductValue,
  });

  const customer = await autumnV1.customers.get(customerId);
  const balance = customer.features[TestFeature.Messages].balance;
  const usage = customer.features[TestFeature.Messages].usage;

  // Use Decimal to avoid floating point errors
  const expectedBalance = new Decimal(initialBalance).sub(deductValue).toNumber();
  
  expect(balance).toBe(expectedBalance);
  expect(usage).toBe(deductValue);
});
```

## Common Scenarios

### 1. Basic Track (No Value)

```typescript
test("should deduct 1 when no value provided", async () => {
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    // No value = defaults to 1
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(99);
  expect(customer.features[TestFeature.Messages].usage).toBe(1);
});
```

### 2. Track with Value

```typescript
test("should deduct exact value", async () => {
  const initialBalance = 100;
  const deductValue = 37.89; // Use decimals for robustness

  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: deductValue,
  });

  const customer = await autumnV1.customers.get(customerId);
  const expectedBalance = new Decimal(initialBalance).sub(deductValue).toNumber();
  
  expect(customer.features[TestFeature.Messages].balance).toBe(expectedBalance);
});
```

### 3. Event-Based Tracking

```typescript
test("should deduct from multiple features using event_name", async () => {
  const deductValue = 45.67;

  await autumnV1.track({
    customer_id: customerId,
    event_name: "action-event", // Triggers action1 AND action2
    value: deductValue,
  });

  const customer = await autumnV1.customers.get(customerId);
  
  // Both features deducted
  expect(customer.features[TestFeature.Action1].balance).toBe(
    new Decimal(200).sub(deductValue).toNumber()
  );
  expect(customer.features[TestFeature.Action2].balance).toBe(
    new Decimal(150).sub(deductValue).toNumber()
  );
});
```

### 4. Credit Systems

**Direct Credit Tracking:**
```typescript
test("should deduct from credits directly", async () => {
  const deductValue = 27.35;

  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Credits,
    value: deductValue,
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Credits].balance).toBe(
    new Decimal(100).sub(deductValue).toNumber()
  );
});
```

**Track Action (Uses Credits with Multiplier):**
```typescript
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

test("should deduct from credits with credit_cost multiplier", async () => {
  const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);
  const action1Value = 50.25;
  
  const expectedCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature!,
    amount: action1Value,
  });

  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: action1Value,
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Credits].balance).toBe(
    new Decimal(200).sub(expectedCreditCost).toNumber()
  );
});
```

### 5. Deduction Order (Feature First, Then Credits)

```typescript
test("should deduct from action1 first, then credits", async () => {
  // Product has: action1 (100 units) + credits (200 units)
  
  // First track: only affects action1
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 40.5,
  });

  let customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Action1].balance).toBe(59.5);
  expect(customer.features[TestFeature.Credits].balance).toBe(200); // Untouched

  // Second track: finishes action1, dips into credits
  const deductValue = 80;
  const remainingAction1 = 59.5;
  const overflowAmount = deductValue - remainingAction1;
  
  const creditCostForOverflow = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature!,
    amount: overflowAmount,
  });

  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: deductValue,
  });

  customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Action1].balance).toBe(0); // Depleted
  expect(customer.features[TestFeature.Credits].balance).toBe(
    new Decimal(200).sub(creditCostForOverflow).toNumber()
  );
});
```

### 6. Concurrent Requests

```typescript
test("should handle concurrent requests correctly", async () => {
  const initialBalance = 100;
  
  // Send 5 concurrent requests, each trying to deduct 10
  const promises = [
    autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 10 }),
    autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 10 }),
    autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 10 }),
    autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 10 }),
    autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 10 }),
  ];

  await Promise.all(promises);

  const customer = await autumnV1.customers.get(customerId);
  const expectedBalance = new Decimal(initialBalance).sub(50).toNumber();
  
  expect(customer.features[TestFeature.Messages].balance).toBe(expectedBalance);
  expect(customer.features[TestFeature.Messages].usage).toBe(50);
});
```

### 7. Balance Capping

```typescript
test("should cap balance at 0 with default behavior", async () => {
  // Initial balance: 5
  // Try to deduct: 50 (more than available)
  
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: 50,
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(0); // Capped
  expect(customer.features[TestFeature.Messages].usage).toBe(5); // Only deducted what was available
});
```

## Multiple Credit System Pairs

```typescript
test("should deduct from two credit system pairs simultaneously", async () => {
  // Product has:
  // - action1 (80) + credits (150)
  // - action3 (60) + credits2 (100)
  
  const deductValue = 25.5;

  await autumnV1.track({
    customer_id: customerId,
    event_name: "action-event", // Triggers both action1 and action3
    value: deductValue,
  });

  const customer = await autumnV1.customers.get(customerId);
  
  // Both actions deducted
  expect(customer.features[TestFeature.Action1].balance).toBe(
    new Decimal(80).sub(deductValue).toNumber()
  );
  expect(customer.features[TestFeature.Action3].balance).toBe(
    new Decimal(60).sub(deductValue).toNumber()
  );
  
  // Credits untouched (actions had enough balance)
  expect(customer.features[TestFeature.Credits].balance).toBe(150);
  expect(customer.features[TestFeature.Credits2].balance).toBe(100);
});
```

## Required Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
```

## Test File Template

```typescript
import { Decimal } from "decimal.js";

const testCase = "track-X";
const customerId = "track-X";

const someFeature = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 100,
});

const freeProd = constructProduct({
  type: "free",
  isDefault: false,
  items: [someFeature],
});

describe(`${chalk.yellowBright("track-X: description")}`, () => {
  const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

  beforeAll(async () => {
    await initCustomerV3({ ctx, customerId, withTestClock: false });
    await initProductsV0({ ctx, products: [freeProd], prefix: testCase });
    await autumnV1.attach({ customer_id: customerId, product_id: freeProd.id });
  });

  test("should have initial balance", async () => {
    const customer = await autumnV1.customers.get(customerId);
    expect(customer.features[TestFeature.Messages].balance).toBe(100);
  });

  test("should deduct correctly", async () => {
    const deductValue = 23.47; // Use random decimals
    
    await autumnV1.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: deductValue,
    });

    const customer = await autumnV1.customers.get(customerId);
    const expectedBalance = new Decimal(100).sub(deductValue).toNumber();
    
    expect(customer.features[TestFeature.Messages].balance).toBe(expectedBalance);
  });
});
```

## Key Differences from /check

| Aspect | /check | /track |
|--------|--------|--------|
| **Purpose** | Validate access | Record usage |
| **Modifies Data** | No | Yes (deducts balance) |
| **Returns** | Allowed/balance info | Success/event details |
| **Synchronous** | Yes | Yes (no timeouts needed) |
| **Credit Systems** | Check action, shows credit balance | Deducts from action, falls back to credits |
| **Concurrency** | N/A | Handled with SQL atomicity |

## Best Practices

### ✅ DO
- Use `Decimal` for all balance calculations: `new Decimal(100).sub(23.47).toNumber()`
- Use random decimal values (23.47, 37.89, 50.25) for test robustness
- Test initial balance before tracking
- Test both `feature_id` and `event_name` approaches
- Import `getCreditCost` when testing credit systems
- Test deduction order (feature → credits)
- Verify both `balance` and `usage` fields

### ❌ DON'T
- Don't use raw arithmetic: `100 - 23.47` (floating point errors!)
- Don't use timeouts (track is synchronous)
- Don't test on Credits feature directly (test on actions)
- Don't assume balance order without sorting
- Don't forget to test concurrent scenarios

## Checklist

- [ ] Unique test case name (e.g., "track-basic1")
- [ ] Use chalk for describe block
- [ ] Use `Decimal` for balance calculations
- [ ] Random decimal values for `value` parameter
- [ ] Initialize in correct order: customer → products → attach
- [ ] Test initial balance first
- [ ] For credit systems: use `getCreditCost` helper
- [ ] Verify both `balance` and `usage` fields
- [ ] Test concurrent requests when relevant
- [ ] No setTimeout/timeouts (track is synchronous)

## Common Pitfalls

### ❌ Floating Point Error
```typescript
// BAD
expect(balance).toBe(100 - 23.47); // May fail due to floating point

// GOOD
expect(balance).toBe(new Decimal(100).sub(23.47).toNumber());
```

### ❌ Testing Credits Directly
```typescript
// BAD - Tests credit feature directly
await autumnV1.track({
  feature_id: TestFeature.Credits,
  value: 50,
});

// GOOD - Tests action that uses credits
await autumnV1.track({
  feature_id: TestFeature.Action1,
  value: 50,
});
// Then check both action1 and credits balances
```

### ❌ Forgetting Credit Cost Multiplier
```typescript
// BAD - Assumes 1:1 deduction
expect(credits.balance).toBe(100 - 50);

// GOOD - Calculates with credit_cost
const expectedCost = getCreditCost({
  featureId: TestFeature.Action1,
  creditSystem: creditFeature,
  amount: 50,
});
expect(credits.balance).toBe(new Decimal(100).sub(expectedCost).toNumber());
```

## Advanced: Testing Deduction Order

When a product has both a metered feature AND a credit system:

1. **First**: Deducts from the metered feature
2. **Then**: When depleted, falls back to credit system
3. **Credit Cost**: Applied when using credit system (not 1:1)

```typescript
// Setup: action1 (100) + credits (200), credit_cost = 0.2

// Track 40 → only action1 affected
// action1: 60, credits: 200

// Track 80 → finishes action1 (60), then uses credits for remaining 20
// action1: 0, credits: 200 - (20 * 0.2) = 196

// Track 50 → only credits affected
// action1: 0, credits: 196 - (50 * 0.2) = 186
```

