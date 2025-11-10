# Test Migration Guide

## Overview
This guide explains how to migrate test files from the global state pattern to the isolated test context pattern.

## Quick Start Migration Prompt (Copy & Paste)

Use this prompt for AI coding agents to migrate test files:

```
Migrate test file [FILE_PATH] from global state to isolated test context.

**Setup:**
1. Create backup: `cp [FILE_PATH] [FILE_PATH.backup.test.ts]` (DO NOT delete backup)
2. Read migration guide: @server/tests/MIGRATION_GUIDE.md
3. Read original file to understand all test logic

**Critical Rules:**
- PRESERVE ALL test logic, assertions, and edge cases
- DO NOT remove force_checkout tests or any existing tests
- Replace `compareMainProduct` with `expectCustomerV0Correct`
- Use TestFeature enum (Messages, Dashboard, Admin) instead of global features
- Products MUST be created with `initProductsV0` BEFORE customer creation
- Free trials use this exact structure:
  ```typescript
  freeTrial: {
    length: 7,
    duration: FreeTrialDuration.Day,  // Import from @autumn/shared
    unique_fingerprint: true,
    card_required: true,
  }
  ```

**Migration Steps:**
1. Replace global imports with TestFeature enum
2. Define products inline using `constructProduct()` and feature item constructors
3. Set `const customerId = testCase;` at top of describe block
4. Create AutumnInt instance with `ctx.orgSecretKey` and `ApiVersion.V1_2`
5. In beforeAll:
   - Call `initProductsV0({ ctx, products, prefix: testCase, customerId })` FIRST
   - Then call `initCustomerV3({ ctx, customerId, ... })`
6. Replace `compareMainProduct` with `expectCustomerV0Correct`
7. For entitlement types, use: `ApiCustomerV1["entitlements"][number]`
8. When checking entitlements, iterate through REFERENCE product (what you sent), not customer data

**Testing:**
Run: `bun test --timeout 0 [FILE_PATH]`

If you encounter unfamiliar utility functions, STOP and ASK how to handle them.
```

## Detailed Migration Prompt for Coding Agent

```
Migrate the test file [FILE_PATH] from using global state to isolated test context.

Reference the migration guide at @server/tests/MIGRATION_GUIDE.md for the full pattern.

**Critical Requirements:**
1. DO NOT remove any existing test logic - preserve ALL test cases and assertions
2. DO NOT remove any force_checkout tests or other edge case tests
3. Compare line-by-line with the original file to ensure nothing is lost
4. If you encounter unfamiliar utility functions (beyond `compareMainProduct`), STOP and ASK the user how to handle them - do not attempt to migrate them on your own

**Migration Steps:**

1. **Create a Backup Copy**
   - BEFORE making any changes, create a copy of the test file for reference
   - Example: `cp basic2.test.ts basic2.test.ts.backup`
   - This allows you to compare line-by-line during migration to ensure nothing is lost
   - Delete the backup file after migration is complete and verified

2. **Replace Global Imports**
   - Remove: `import { features, products } from "tests/global.js";`
   - Add: `import { TestFeature } from "tests/setup/v2Features.js";`

3. **Create Inline Product Definitions**
   - Use `constructProduct()` to define products directly in the test file
   - Use `constructFeatureItem()`, `constructPrepaidItem()`, etc. for items
   - Reference TestFeature enum instead of global features object
   - Add a unique prefix to product IDs (e.g., testCase name)

4. **Update Test Setup**
   - Add `const customerId = testCase;` at the top of describe block
   - Create AutumnInt instance with org secret key:
     ```typescript
     const autumnV1 = new AutumnInt({
       secretKey: ctx.orgSecretKey,
       version: ApiVersion.V1_2,
     });
     ```
   - In beforeAll:
     - Call `initProductsV0({ ctx, products: [...], prefix: testCase, customerId })` BEFORE customer creation
       - **IMPORTANT:** Passing `customerId` to `initProductsV0` automatically handles customer cleanup if they exist - you DO NOT need to manually delete the customer first
     - Call `initCustomerV3({ ctx, customerId, ... })` AFTER products

5. **Update Test Assertions**
   - Replace `compareMainProduct` with `expectCustomerV0Correct` for v0.1 API
   - Replace references to `features.metered1` with `TestFeature.Messages`
   - Replace references to `features.boolean1` with `TestFeature.Dashboard`
   - Use `AutumnCli.getCustomer()` for v0.1 API format (returns `features` object)
   - Use `autumnV1.customers.get()` for v1.2 API format (returns `entitlements` array)

   **Type Helpers:**
   - For entitlement types from v0.1 API, use: `ApiCustomerV1["entitlements"][number]`
   - Import from: `import type { ApiCustomerV1 } from "@shared/api/customers/previousVersions/apiCustomerV1.js";`
   - Example:
     ```typescript
     const addOnBalance = cusRes.entitlements.find(
       (e: ApiCustomerV1["entitlements"][number]) =>
         e.feature_id === TestFeature.Messages && e.interval === "lifetime"
     );
     ```

   **⚠️ CRITICAL - Entitlement Checking Pattern:**
   When testing entitlements with `/check` endpoint, you MUST iterate through the **reference product's entitlements** (what you SENT), NOT the customer's entitlements (what they have).

   **WRONG (iterating through customer's entitlements):**
   ```typescript
   const customer = await AutumnCli.getCustomer(customerId);
   const entitlements = customer.features; // ❌ WRONG!

   for (const featureId of Object.keys(entitlements)) {
     const res = await AutumnCli.entitled(customerId, featureId);
     // checking against customer data...
   }
   ```

   **CORRECT (iterating through reference product's entitlements):**
   ```typescript
   import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";

   // Convert ProductV2 to V1 to get reference entitlements
   const proProdV1 = convertProductV2ToV1({
     productV2: proProd,
     orgId: ctx.org.id,
     features: ctx.features,
   });
   const proEntitlements = proProdV1.entitlements;

   // Iterate through reference product's entitlements
   for (const entitlement of Object.values(proEntitlements)) {
     const res = await AutumnCli.entitled(customerId, entitlement.feature_id);
     // Check that the response matches what we SENT...
     expect(res.allowed).toBe(true);
     if (entitlement.allowance) {
       const balance = res.balances.find(b => b.feature_id === entitlement.feature_id);
       expect(balance?.balance).toBe(entitlement.allowance);
     }
   }
   ```

   This pattern ensures you're testing what you SENT against what you GET back from the API.

   **⚠️ IMPORTANT - Unfamiliar Utility Functions:**
   If you encounter utility functions that you're not sure how to migrate (e.g., `compareMainProduct`, `expectProductCorrect`, `checkEntitlements`, or other custom assertion helpers):
   - **DO NOT attempt to migrate or replace them on your own**
   - **STOP and ASK the user**: "I found utility function [FUNCTION_NAME] at line [LINE]. How should I handle this in the migration?"
   - Wait for explicit instructions on the correct replacement function or pattern
   - Common replacements so far:
     - `compareMainProduct` → `expectCustomerV0Correct`
     - But there may be others that need different handling!

6. **Verify All Logic Preserved**
   - Check that every test case from the original file exists
   - Check that every assertion is present
   - Check that force_checkout tests are included
   - Check that edge case tests are not removed

7. **Update Test Case ID**
   - Change `testCase = "testname"` to keep original name (not "testname-new")
   - Update console.log messages to use correct testCase

8. **Run Tests**
   - Verify all tests pass with `bun test --timeout 0 [FILE_PATH]`
   - The `--timeout 0` flag disables test timeouts, which is necessary for tests that involve checkout flows and longer async operations

**Example Migration:**

Before:
```typescript
import { features, products } from "tests/global.js";

const testCase = "basic1";
describe("basic1", () => {
  const customerId = testCase;

  beforeAll(async () => {
    await initCustomerV3({ ctx, customerId });
  });

  test("should have correct entitlements", async () => {
    const entitled = await AutumnCli.entitled(customerId, features.metered1.id);
    expect(entitled.allowed).toBe(true);
  });
});
```

After:
```typescript
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const freeProd = constructProduct({
  type: "free",
  isDefault: true,
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 5,
      interval: ProductItemInterval.Month,
    }),
  ],
});

const testCase = "basic1";
const customerId = testCase;

describe("basic1", () => {
  const autumnV1 = new AutumnInt({
    secretKey: ctx.orgSecretKey,
    version: ApiVersion.V1_2,
  });

  beforeAll(async () => {
    // Passing customerId automatically handles cleanup
    await initProductsV0({
      ctx,
      products: [freeProd],
      prefix: testCase,
      customerId,
    });

    await initCustomerV3({
      ctx,
      customerId,
      customerData: { fingerprint: "test" },
      withTestClock: false,
    });
  });

  test("should have correct entitlements", async () => {
    const entitled = await AutumnCli.entitled(customerId, TestFeature.Messages);
    expect(entitled.allowed).toBe(true);
  });
});
```

**After Migration:**
- Replace the original file (not create a .new.test.ts file)
- Verify tests pass
- Report any issues or edge cases found
```

## Common Patterns

### Product Construction
```typescript
// Free product with feature
const freeProd = constructProduct({
  type: "free",
  isDefault: true,
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 5,
      interval: ProductItemInterval.Month,
    }),
  ],
});

// Pro product (matches global products.pro)
// - Boolean feature (Dashboard)
// - Metered feature (Messages) with 10 allowance
// - Unlimited feature (Admin)
// - Monthly subscription price ($20)
const proProd = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Dashboard,
      isBoolean: true,
    }),
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 10,
      interval: ProductItemInterval.Month,
    }),
    constructFeatureItem({
      featureId: TestFeature.Admin,
      unlimited: true,
    }),
  ],
});

// Pro product with free trial
// IMPORTANT: Free trial structure must use this exact format
const proWithTrial = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Dashboard,
      isBoolean: true,
    }),
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 10,
      interval: ProductItemInterval.Month,
    }),
    constructFeatureItem({
      featureId: TestFeature.Admin,
      unlimited: true,
    }),
  ],
  freeTrial: {
    length: 7,
    duration: FreeTrialDuration.Day,  // Import FreeTrialDuration from @autumn/shared
    unique_fingerprint: true,  // Set to true to prevent duplicate trials per fingerprint
    card_required: true,
  },
});

// Add-on product
const addOnProd = constructProduct({
  type: "paid",
  id: "addon",
  isAddOn: true,
  items: [
    constructPrepaidItem({
      featureId: TestFeature.Messages,
      price: 500, // $5.00
      billingUnits: 100,
    }),
  ],
});
```

### Feature Mapping
- `features.metered1` → `TestFeature.Messages`
- `features.boolean1` → `TestFeature.Dashboard`
- `features.metered2` → Create new feature if needed

### API Version Differences
- **v0.1 API** (AutumnCli): Returns `{ features: { [featureId]: {...} } }`
- **v1.2 API** (AutumnInt): Returns `{ entitlements: [...] }`

## Why This Migration?

1. **Parallel Test Isolation**: Tests can run in parallel without conflicting
2. **No Global State**: Each test has its own products and data
3. **Test Independence**: Tests don't depend on setup order
4. **Better Debugging**: Each test is self-contained and easier to understand
