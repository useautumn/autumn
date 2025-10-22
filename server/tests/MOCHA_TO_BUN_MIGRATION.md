# Mocha to Bun Test Migration Guide

## Quick Reference

### 1. Update Imports

**Remove:**
```typescript
import { expect } from "chai";
import { setupBefore } from "tests/before.js";
```

**Add:**
```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
```

**Keep:** All AutumnCli, global products/features imports, and utility imports.

### 2. Replace Test Hooks

**Before:**
```typescript
before(async function () {
    await setupBefore(this);
    db = this.db;
    org = this.org;
    env = this.env;
    
    await initCustomer({
        autumn: this.autumnJs,
        customerId,
        db,
        org,
        env,
        fingerprint: "test",
        withTestClock: false,
    });
});
```

**After:**
```typescript
beforeAll(async () => {
    await initCustomerV3({
        ctx,
        customerId,
        customerData: { fingerprint: "test" },
        withTestClock: false,
    });
});
```

### 3. Initialize Products

**Before:**
```typescript
await createProducts({
    db,
    orgId: org.id,
    env,
    autumn,
    products: [product1, product2],
});
```

**After:**
```typescript
await initProductsV0({
    ctx,
    products: [product1, product2],
    prefix: testCase,
});
```

### 4. Update Test Functions

Replace `it` with `test`:
```typescript
// Before
it("should do something", async () => { ... });

// After  
test("should do something", async () => { ... });
```

### 5. Update Assertions

| Chai | Bun |
|------|-----|
| `expect(x).to.be.true` | `expect(x).toBe(true)` |
| `expect(x).to.be.false` | `expect(x).toBe(false)` |
| `expect(x).to.exist` | `expect(x).toBeDefined()` |
| `expect(x).to.not.exist` | `expect(x).toBeUndefined()` |
| `expect(x).to.equal(y)` | `expect(x).toBe(y)` |
| `expect(x).to.have.lengthOf(n)` | `expect(x).toHaveLength(n)` |
| `expect(x).to.be.greaterThan(n)` | `expect(x).toBeGreaterThan(n)` |

### 6. Important Parameters

Always preserve these from the original test:

**customerData.fingerprint:**
- Default: no fingerprint (or empty string)
- Common: `{ fingerprint: "test" }`
- Trials: `{ fingerprint: Math.random().toString(36).substring(2, 15) }`

**attachPm:**
- Not needed: tests with checkout flow
- `"success"`: tests that need payment method pre-attached
- `"fail"`: tests for failed payment scenarios

**withTestClock:**
- `true`: most tests (allows time travel)
- `false`: tests that don't need test clocks

### 7. Rename Files

```bash
mv test-name.ts test-name.test.ts
```

All test files must end with `.test.ts` for Bun to recognize them.

### 8. Update Shell Scripts

**Before:**
```bash
$MOCHA_CMD 'tests/attach/basic/*.ts'
```

**After:**
```bash
$BUN_PARALLEL tests/attach/basic
```

## Common Patterns

### Pattern 1: Basic Test
```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "test1";

describe("Test description", () => {
    const customerId = testCase;
    
    beforeAll(async () => {
        await initCustomerV3({
            ctx,
            customerId,
            withTestClock: true,
        });
    });
    
    test("should do something", async () => {
        // test code
    });
});
```

### Pattern 2: With Custom Products
```typescript
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

beforeAll(async () => {
    await initCustomerV3({ ctx, customerId, withTestClock: true });
    
    await initProductsV0({
        ctx,
        products: [customProduct],
        prefix: testCase,
    });
});
```

### Pattern 3: With Payment Method
```typescript
beforeAll(async () => {
    await initCustomerV3({
        ctx,
        customerId,
        attachPm: "success",
        withTestClock: true,
    });
});
```

## Checklist

- [ ] Update imports (add bun:test, ctx, initCustomerV3)
- [ ] Replace `before` with `beforeAll`
- [ ] Replace `it` with `test`
- [ ] Update all chai assertions to Bun
- [ ] Replace initCustomer with initCustomerV3
- [ ] Replace createProducts with initProductsV0
- [ ] Verify fingerprint parameter
- [ ] Verify attachPm parameter
- [ ] Verify withTestClock parameter
- [ ] Rename file to `.test.ts`
- [ ] Update shell script if needed
- [ ] Remove `this` context references
- [ ] Test runs successfully

## Notes

- **No timeout needed**: Tests run with `--timeout 0` globally
- **Keep AutumnCli**: Don't replace with AutumnInt for API calls
- **Preserve test logic**: Only change framework, not test behavior
- **ctx is global**: Imported from createTestContext, contains db/org/env/stripeCli

