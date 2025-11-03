# Guide: Writing /check Endpoint Tests

## What is /check?

The `/check` endpoint validates whether a customer has access to a feature and returns their usage balance.

**Parameters:**
- `customer_id` (required) - The customer to check
- `feature_id` (required) - The feature to check access for
- `required_balance` (optional) - How much balance/usage is needed (defaults to 1)

**Returns:** Whether the customer is `allowed` to use the feature, along with balance information.

## Step-by-Step: Writing a /check Test

### Step 1: Define What You're Testing

Identify the specific scenario:
- Feature not attached to customer
- Boolean feature (on/off access)
- Metered feature with usage limits
- Unlimited feature
- Credit system (actions that consume from a credit pool)
- Overage behavior

### Step 2: Construct Features & Products

#### Feature Types

**Boolean Features** - Simple on/off access:
```typescript
const dashboardFeature = constructFeatureItem({
  featureId: TestFeature.Dashboard,
  isBoolean: true,
});
```

**Metered Features** - Usage-based with limits:
```typescript
// Basic metered (resets monthly)
const messagesFeature = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 1000,
});

// Unlimited
const storageFeature = constructFeatureItem({
  featureId: TestFeature.Storage,
  unlimited: true,
});
```

**Pay-per-use (Arrear)** - Overage pricing:
```typescript
const apiCallsFeature = constructArrearItem({
  featureId: TestFeature.ApiCalls,
  includedUsage: 10000,
  price: 0.1,           // Price per billing_units
  billingUnits: 1000,   // Charged per 1000 calls
  usageLimit: 50000,    // Hard cap (optional)
});
```

**Prepaid (Allocated)** - Pre-purchased units (seats, licenses):
```typescript
const seatsFeature = constructPrepaidItem({
  featureId: TestFeature.Seats,
  price: 10,
  billingUnits: 1,
  includedUsage: 5,
});
```

**Credit Systems** - A credit pool that multiple features consume from:
```typescript
// The credit pool
const creditsFeature = constructFeatureItem({
  featureId: TestFeature.Credits,
  includedUsage: 100,
});

// When testing, check Action1 or Action2 features
// These will consume from the Credits pool
```

**IMPORTANT for Credit Systems:**
- Attach the `Credits` feature to the product
- Call `/check` on `Action1` or `Action2` (NOT on Credits directly)
- The response will show the Credits balance in the `balances` array
- When testing v0 responses, use `getCreditCost({ featureId, creditSystem, amount })` from `@/internal/features/creditSystemUtils.js` to calculate the expected `required` field in balances
- Example: Customer has 100 credits, checking Action1 for 50 units → allowed, shows 100 credit balance

#### Combine into Products

```typescript
const proProd = constructProduct({
  type: "free",  // IMPORTANT: Set type to "free" for immediate attachment
  isDefault: false,
  items: [messagesFeature, dashboardFeature],
});
```

**IMPORTANT: Product Type**
- **`type: "free"`** - Feature is attached to customer **immediately** after `attach()` call
- **`type: "pro"` or other paid types** - Feature requires payment/subscription flow and may not be immediately available for testing
- **Rule of thumb:** For track/check tests, always use `type: "free"` unless specifically testing paid subscription flows

### Step 3: Initialize Test Environment

**Always use this exact order in `beforeAll`:**

```typescript
const testCase = "your-test-name";
const customerId = "your-test-name";

beforeAll(async () => {
  // 1. Create customer
  await initCustomerV3({
    ctx,
    customerId,
    attachPm: "success",      // Include if testing paid features
    withTestClock: false,
  });

  // 2. Create products
  await initProductsV0({
    ctx,
    products: [proProd],
    prefix: testCase,
  });

  // 3. Attach product to customer (if testing attached features)
  await autumnV1.attach({
    customer_id: customerId,
    product_id: proProd.id,
  });
});
```

### Step 4: Write Test Cases

Test both v0 and v1 APIs:

```typescript
test("v0 response", async () => {
  const res = (await autumnV0.check({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    required_balance: 100,
  })) as unknown as CheckResponseV0;

  expect(res.allowed).toBe(true);
  expect(res.balances).toHaveLength(1);
  expect(res.balances[0]).toMatchObject({
    feature_id: TestFeature.Messages,
    balance: 1000,
    required: 100,
  });
});

test("v1 response", async () => {
  const res = (await autumnV1.check({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    required_balance: 100,
  })) as unknown as CheckResponse;

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
});
```

## Common Scenarios

### Feature Not Attached
```typescript
// Don't call autumnV1.attach() in beforeAll
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
});
expect(res.allowed).toBe(false);
```

### Exceeds Limit
```typescript
const res = await autumnV0.check({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  required_balance: 9999, // More than available
});
expect(res.allowed).toBe(false);
```

### Boolean Feature
```typescript
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Dashboard,
});
expect(res.allowed).toBe(true);
// No balance field for boolean features
```

### Credit System
```typescript
// Product has Credits feature attached
const res = await autumnV1.check({
  customer_id: customerId,
  feature_id: TestFeature.Action1, // Check the action, not Credits
  required_balance: 50,
});
expect(res.allowed).toBe(true);
expect(res.balance).toBe(100); // Shows Credits balance
```

## Required Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import {
  ApiVersion,
  type CheckResponse,
  type CheckResponseV0,
  SuccessCode,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem, constructArrearItem, constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
```

## Test File Template

```typescript
const testCase = "check-X";
const customerId = "check-X";

describe(`${chalk.yellowBright("check-X: description")}`, () => {
  const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
  const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

  beforeAll(async () => {
    // Initialize customer, products, attach
  });

  test("v0 response", async () => {
    // Test v0
  });

  test("v1 response", async () => {
    // Test v1
  });
});
```

## Checklist

- [ ] Unique test case name (e.g., "credit-systems1")
- [ ] Use chalk for describe block
- [ ] Test both v0 and v1 APIs
- [ ] Initialize in correct order: customer → products → attach
- [ ] For credit systems: attach Credits, check Action1/Action2
- [ ] Verify `next_reset_at` is defined (v1 time-based features)
- [ ] Use `.toMatchObject()` for partial matches, `.toStrictEqual()` for exact
