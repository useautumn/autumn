# Test Migration Guide: Global State → Parallel-Ready Tests

## Status

- ✅ Phase 1: Migration guide created
- ✅ Phase 2: Conversion utilities completed
- ✅ Phase 3: Validation process documented
- ✅ Phase 4: Initial test migrations validated (basic1, basic2)

**See [VALIDATION_RESULTS.md](./VALIDATION_RESULTS.md) for detailed validation analysis.**

## Validation Process

**CRITICAL:** Before replacing any test file, you MUST validate the migration preserves test logic.

### Step-by-Step Validation

1. **Create New File** - Don't modify original
   ```bash
   # Create basic1.new.test.ts (not basic1.test.ts)
   ```

2. **Run Original Test** - Uses global state
   ```bash
   cd server
   bun test tests/attach/basic/basic1.test.ts
   ```
   - Note all assertions and expected values
   - Save output for comparison

3. **Run Migrated Test** - Uses inline products
   ```bash
   cd server
   bun parallel-tests
   # Or configure config.ts to point to basic1.new.test.ts
   ```

4. **Compare Test Logic** - **NOT** output values
   - ✅ Same test structure (beforeAll, test blocks)
   - ✅ Same assertions (expect calls)
   - ✅ Same logic flow
   - ❌ Don't compare feature IDs (metered1 → Messages is OK)
   - ❌ Don't compare product names (different orgs)

5. **Critical Checks**
   - Both tests pass ✅
   - Same number of assertions
   - Same expected behavior (e.g., "balance should be 5")
   - No logic lost or added

6. **Only After Validation** - Replace original
   ```bash
   mv basic1.new.test.ts basic1.test.ts
   ```

### Example: basic1.test.ts Migration

**Original** (uses global state):
```typescript
test("should have correct entitlements", async () => {
  const expectedEntitlement = products.free.entitlements.metered1;
  const entitled = await AutumnCli.entitled(customerId, features.metered1.id);
  const balance = entitled.balances.find(b => b.feature_id === features.metered1.id);

  expect(entitled.allowed).toBe(true);
  expect(balance).toBeDefined();
  expect(balance.balance).toBe(expectedEntitlement.allowance); // 5
  expect(balance.unlimited).toBeUndefined();
});
```

**Migrated** (uses inline products):
```typescript
test("should have correct entitlements", async () => {
  // Expected: 5 allowance for Messages feature (same as metered1)
  const entitled = await AutumnCli.entitled(customerId, TestFeature.Messages);
  const balance = entitled.balances.find(b => b.feature_id === TestFeature.Messages);

  expect(entitled.allowed).toBe(true);
  expect(balance).toBeDefined();
  expect(balance.balance).toBe(5); // Same expected value
  expect(balance.unlimited).toBeUndefined();
});
```

**Key Differences (ALLOWED)**:
- Feature ID: `features.metered1.id` → `TestFeature.Messages`
- Source: `products.free.entitlements.metered1` → inline `freeProd` definition
- Expected value: Hardcoded `5` instead of `expectedEntitlement.allowance`

**What Must Stay Same**:
- Number of expects: 4
- Expected values: balance = 5, allowed = true, unlimited = undefined
- Test logic: Check balance, verify allowed, ensure not unlimited

## Quick Start

### Is Your Test Already Migrated?

**✅ Already Done** - Your test uses:
- Inline product definitions (`constructProduct`)
- V1.2+ API (`AutumnInt` with `LegacyVersion.v1_2` or higher)
- Modern assertions (`expectProductAttached`, `expectFeaturesCorrect`)

**❌ Needs Migration** - Your test uses:
- `products.*` from `tests/global.ts`
- V0.1 API (`AutumnCli.getCustomer()`)
- Legacy assertions (`compareMainProduct`)

## Migration Steps

### 1. Define Products Inline

**Before:**
```typescript
import { products } from "tests/global.js";

// Uses products.pro
```

**After:**
```typescript
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const pro = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 10,
    }),
  ],
});
```

### 2. Initialize Products in beforeAll

```typescript
beforeAll(async () => {
  await initProductsV0({
    ctx,
    products: [pro],  // Pass inline products
    prefix: testCase,
  });
});
```

### 3. Update Assertions

#### For V0.1 API (AutumnCli):

**Before:**
```typescript
import { compareMainProduct } from "tests/utils/compare.js";
const res = await AutumnCli.getCustomer(customerId);
compareMainProduct({ sent: products.pro, cusRes: res });
```

**After:**
```typescript
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
const res = await AutumnCli.getCustomer(customerId);
await expectCustomerV0Correct({ sent: pro, cusRes: res });
```

#### For V1.2+ API (AutumnInt):

**Already correct:**
```typescript
const customer = await autumn.customers.get(customerId);
expectProductAttached({ customer, product: pro });
expectFeaturesCorrect({ customer, product: pro });
```

## Product Mapping Reference

### Free Product
```typescript
// global.ts: products.free
const free = constructProduct({
  type: "free",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 5,
      interval: ProductItemInterval.Month,
    }),
  ],
});
```

### Pro Product
```typescript
// global.ts: products.pro
const pro = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 10,
      interval: ProductItemInterval.Month,
    }),
  ],
});
```

### Pro with Overage
```typescript
// global.ts: products.proWithOverage
const proWithOverage = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 10,
    }),
    constructArrearItem({
      featureId: TestFeature.Messages,
    }),
  ],
});
```

## Common Patterns

### Multiple Features
```typescript
const product = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 100,
    }),
    constructFeatureItem({
      featureId: TestFeature.Dashboard,
      isBoolean: true,
    }),
  ],
});
```

### Prepaid/Arrear Pricing
```typescript
const product = constructProduct({
  type: "pro",
  items: [
    constructPrepaidItem({
      featureId: TestFeature.Messages,
      price: 9,
      billingUnits: 100,
    }),
    // OR
    constructArrearItem({
      featureId: TestFeature.Words,
      price: 0.1,
      billingUnits: 1000,
    }),
  ],
});
```

## Files to Migrate

### ✅ Completed
- `tests/attach/basic/basic1.test.ts` - Migrated to basic1.new.test.ts
- `tests/attach/basic/basic2.test.ts` - Migrated to basic2.new.test.ts

### Priority 1 (Simple)
- `tests/attach/basic/basic3.test.ts` - Uses products.premium

### Priority 2 (Medium)
- `tests/attach/upgrade/*.test.ts`
- `tests/attach/downgrade/*.test.ts`

### Priority 3 (Complex)
- `tests/attach/entities/*.test.ts`
- `tests/core/cancel/*.test.ts`

## Utilities Reference

- `constructProduct()` - Create product with items
- `constructFeatureItem()` - Create feature entitlement
- `constructPrepaidItem()` - Create prepaid feature price
- `constructArrearItem()` - Create pay-per-use (single_use) [eg. credits, messages, tokens] feature price
- `constructArrearProratedItem()` - Create pay-per-use (continuous_use) [eg. seats, users, admins] feature price
- `constructFixedPrice()` - Create fixed price
- `expectCustomerV0Correct()` - Compare V2 product with V0.1 customer response
- `expectProductAttached()` - V1.2+ API product check
- `expectFeaturesCorrect()` - V1.2+ API feature balance check
