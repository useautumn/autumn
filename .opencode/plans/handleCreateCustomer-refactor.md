# handleCreateCustomer Refactor Plan

## Overview

Refactor `handleCreateCustomer` to:
1. Eliminate race conditions causing duplicate customers or missing default products
2. Clean up input types with a single source of truth
3. Ensure comprehensive test coverage before making changes

---

## Part 1: Type Cleanup

### Problem

Three overlapping types with duplicated ID validation logic:
- `CreateCustomerSchema` in `shared/models/cusModels/cusModels.ts`
- `CustomerDataSchema` in `shared/api/common/customerData.ts`
- `CreateCustomerParamsSchema` in `shared/api/customers/customerOpModels.ts`

### Solution

Make `shared/api/common/customerData.ts` the single source of truth.

### Changes

#### 1. `shared/api/common/customerData.ts` - Add CustomerIdSchema

```typescript
import { z } from "zod/v4";

// Reusable customer ID validation - can be used by attach, check, track, etc.
export const CustomerIdSchema = z.string().refine(
  (val) => {
    if (val === "") return false;
    if (val.includes("@")) return false;
    if (val.includes(" ")) return false;
    if (val.includes(".")) return false;
    return /^[a-zA-Z0-9_-]+$/.test(val);
  },
  {
    error: (issue) => {
      const input = issue.input as string;
      if (input === "") return { message: "can't be an empty string" };
      if (input.includes("@"))
        return {
          message: "cannot contain @ symbol. Use only letters, numbers, underscores, and hyphens.",
        };
      if (input.includes(" "))
        return {
          message: "cannot contain spaces. Use only letters, numbers, underscores, and hyphens.",
        };
      if (input.includes("."))
        return {
          message: "cannot contain periods. Use only letters, numbers, underscores, and hyphens.",
        };
      const invalidChar = input.match(/[^a-zA-Z0-9_-]/)?.[0];
      return {
        message: `cannot contain '${invalidChar}'. Use only letters, numbers, underscores, and hyphens.`,
      };
    },
  },
);

export const CustomerDataSchema = z
  .object({
    name: z.string().nullish().meta({ description: "Customer's name" }),
    email: z.string().nullish().meta({ description: "Customer's email address" }),
    fingerprint: z.string().nullish().meta({ internal: true }),
    metadata: z.record(z.any(), z.any()).nullish().meta({ internal: true }),
    stripe_id: z.string().nullish().meta({ internal: true }),
    disable_default: z.boolean().optional().meta({ internal: true }),
  })
  .meta({
    id: "CustomerData",
    description: "Customer details to set when creating a customer",
  });

export type CustomerData = z.infer<typeof CustomerDataSchema>;
export type CustomerId = z.infer<typeof CustomerIdSchema>;
```

#### 2. `shared/api/customers/customerOpModels.ts` - Use CustomerIdSchema

```typescript
import { CustomerDataSchema, CustomerIdSchema } from "../common/customerData.js";

// Remove duplicate customerId const, use CustomerIdSchema instead

export const CreateCustomerParamsSchema = z.object({
  id: CustomerIdSchema.nullable().meta({
    description: "Your unique identifier for the customer",
  }),
  ...CustomerDataSchema.shape,
  entity_id: z.string().optional().meta({ internal: true }),
  entity_data: EntityDataSchema.optional().meta({ internal: true }),
});

export const UpdateCustomerParamsSchema = z.object({
  id: CustomerIdSchema.optional().meta({
    description: "New unique identifier for the customer.",
  }),
  // ... rest uses CustomerDataSchema fields
});
```

#### 3. `shared/models/cusModels/cusModels.ts` - Remove CreateCustomerSchema

- Delete `CreateCustomerSchema` (lines 21-69)
- Delete `CreateCustomer` type export (line 78)
- Keep `CustomerSchema` and `Customer` type (used for DB model)

#### 4. `server/src/internal/customers/handlers/handleCreateCustomer.ts` - New Signature

```typescript
// OLD
export const handleCreateCustomer = async ({
  ctx,
  cusData,                    // CreateCustomer type
  createDefaultProducts,
  defaultGroup,
}: {
  ctx: AutumnContext;
  cusData: CreateCustomer;
  createDefaultProducts?: boolean;
  defaultGroup?: string;
})

// NEW
export const handleCreateCustomer = async ({
  ctx,
  customerId,                 // string | null
  customerData,               // CustomerData
  options,
}: {
  ctx: AutumnContext;
  customerId: string | null;
  customerData?: CustomerData;
  options?: {
    createDefaultProducts?: boolean;
    defaultGroup?: string;
  };
})
```

#### 5. Update All Callers

| File | Change |
|------|--------|
| `getOrCreateCustomer.ts` | Pass `customerId` and `customerData` separately |
| `getOrCreateCachedFullCustomer.ts` | Pass `customerId` and `customerData` separately |
| `handlePostCustomerV2.ts` | Extract `id` from parsed body, pass rest as customerData |
| `getOrCreateApiCustomer.ts` | Pass `customerId` and `customerData` separately |
| `createNewCustomer.ts` | Update import, accept new shape |

### Future Work (Not in This PR)

These files can later adopt `CustomerIdSchema` for validation:
- `shared/api/balances/check/checkParams.ts` - `customer_id: CustomerIdSchema`
- `shared/api/balances/track/trackParams.ts`
- `shared/api/billing/attach/*`

---

## Part 2: Test Structure

### File Organization

**3 new test files** using the modern `test.concurrent` + `initScenario` pattern:

| File | Theme |
|------|-------|
| `create-customer.test.ts` | Basic creation + email flows |
| `create-customer-defaults.test.ts` | Default product attachment |
| `create-customer-race.test.ts` | Race condition tests (low-level simulation) |

**Delete after migration:**
- `create-customer1.test.ts` (old pattern)
- `create-customer2.test.ts` (old pattern)

**Add to existing files:**
- `check-race-condition2.test.ts` → Customer auto-creation race via /check
- `track-race-condition5.test.ts` → Customer auto-creation race via /track

---

## Part 3: Test Cases

### `create-customer.test.ts` - Basic Creation + Email Flows

| # | Test Name | Description | From |
|---|-----------|-------------|------|
| 1 | `create: basic with ID` | Create customer with ID, name, email | Migrate from create-customer1 |
| 2 | `create: idempotent with same ID` | Create same customer twice returns existing | Migrate from create-customer1 |
| 3 | `create: with expand params` | Create with expand returns invoices, trials_used, entities | Migrate from create-customer1 |
| 4 | `create: concurrent same ID` | Promise.all two creates with same ID | Migrate from create-customer2 |
| 5 | `create: null ID with email` | Create customer with id=null and valid email | NEW |
| 6 | `create: null ID no email (error)` | Create with id=null and no email throws | NEW |
| 7 | `create: null ID idempotent` | Create with id=null same email twice returns existing | NEW |
| 8 | `create: null ID then add ID` | Create with id=null, then create with same email + ID updates existing | NEW |
| 9 | `create: concurrent null ID same email` | Promise.all two creates with id=null, same email | NEW |

### `create-customer-defaults.test.ts` - Default Product Attachment

| # | Test Name | Description |
|---|-----------|-------------|
| 10 | `defaults: single free product` | Create customer with single default free product attached |
| 11 | `defaults: multiple groups` | Two default free products in different groups, both attached |
| 12 | `defaults: same group priority` | Two defaults in same group, priority: trial > paid > free |
| 13 | `defaults: trial product` | Default trial attaches with status=trialing |
| 14 | `defaults: paid product (legacy)` | Default paid with forcePaidDefault=true uses handleAddProduct |
| 15 | `defaults: paid requires Stripe customer` | Default paid creates Stripe customer, sets stripe_id |

### `create-customer-race.test.ts` - Race Condition Tests (Low-Level)

| # | Test Name | Description |
|---|-----------|-------------|
| 16 | `race: stale cache detection` | Insert customer → concurrent request caches incomplete → getOrCreate detects stale |
| 17 | `race: concurrent default loop` | Insert → start attaching defaults → concurrent 23505 → retry sees all defaults |
| 18 | `race: concurrent same ID (API level)` | Promise.all creates with same ID, one gets 23505, both return same customer |
| 19 | `race: concurrent email+ID update` | Customer exists id=null, two requests add ID via same email |
| 20 | `race: concurrent Stripe customer` | Default paid: concurrent creates only create one Stripe customer |

### Entry Point Auto-Creation Race Tests

#### `check-race-condition2.test.ts`

| # | Test Name | Description |
|---|-----------|-------------|
| 21 | `check-autocreate: concurrent same customer_id` | Concurrent /check calls auto-creating same customer |

#### `track-race-condition5.test.ts`

| # | Test Name | Description |
|---|-----------|-------------|
| 22 | `track-autocreate: concurrent same customer_id` | Concurrent /track calls auto-creating same customer, usage correct |

---

## Part 4: Test Implementation Pattern

### Modern Pattern: `test.concurrent` + `initScenario`

```typescript
import { expect, test } from "bun:test";
import { CusExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// BASIC CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: basic with ID")}`, async () => {
  const { customerId, autumnV1 } = await initScenario({
    customerId: "create-basic-id",
    setup: [s.customer({ testClock: false })],
    actions: [],
  });

  // Delete to test fresh create
  try { await autumnV1.customers.delete(customerId); } catch {}

  const data = await autumnV1.customers.create({
    id: customerId,
    name: "Test Customer",
    email: `${customerId}@example.com`,
  });

  expect(data.id).toBe(customerId);
  expect(data.name).toBe("Test Customer");
  expect(data.email).toBe(`${customerId}@example.com`);
});

test.concurrent(`${chalk.yellowBright("create: idempotent with same ID")}`, async () => {
  const { customerId, autumnV1 } = await initScenario({
    customerId: "create-idempotent",
    setup: [s.customer({ testClock: false })],
    actions: [],
  });

  // First create
  const data1 = await autumnV1.customers.create({
    id: customerId,
    name: "Test Customer",
    email: `${customerId}@example.com`,
  });

  // Second create - should return existing
  const data2 = await autumnV1.customers.create({
    id: customerId,
    name: "Test Customer",
    email: `${customerId}@example.com`,
  });

  expect(data1.id).toBe(data2.id);
  expect(data1.internal_id).toBe(data2.internal_id);
});
```

### Low-Level Race Simulation Pattern

```typescript
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { setCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/setCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";

test.concurrent(`${chalk.yellowBright("race: stale cache detection")}`, async () => {
  const wordsItem = items.monthlyWords({ includedUsage: 1000 });
  const freeDefault = products.base({ id: "free", items: [wordsItem], isDefault: true });

  const { customerId, ctx, autumnV2 } = await initScenario({
    customerId: "race-stale-cache",
    setup: [
      s.customer({ testClock: false }),
      s.products({ list: [freeDefault] }),
    ],
    actions: [],
  });

  // Delete customer so we can manually reproduce race
  try { await autumnV2.customers.delete(customerId); } catch {}
  await deleteCachedFullCustomer({ ctx, customerId, source: "test-cleanup" });

  // STEP 1: Insert customer directly (bypassing handleCreateCustomer)
  const internalId = generateId("cus");
  await CusService.insert({
    db: ctx.db,
    data: {
      id: customerId,
      internal_id: internalId,
      org_id: ctx.org.id,
      env: ctx.env,
      name: customerId,
      email: `${customerId}@test.com`,
      metadata: {},
      created_at: Date.now(),
    },
  });

  // STEP 2: Simulate concurrent request caching incomplete customer
  const incompleteCustomer = await CusService.getFull({
    db: ctx.db,
    idOrInternalId: customerId,
    orgId: ctx.org.id,
    env: ctx.env,
    withEntities: true,
    withSubs: true,
  });

  await setCachedFullCustomer({
    ctx,
    fullCustomer: incompleteCustomer!,
    customerId,
    fetchTimeMs: Date.now(),
    source: "test-concurrent-request",
    overwrite: true,
  });

  // STEP 3: Call actual function - should detect stale state
  const result = await getOrCreateCachedFullCustomer({
    ctx,
    params: { customer_id: customerId, feature_id: TestFeature.Words },
    source: "test-final-check",
  });

  // Verify: Customer has default products
  expect(result.customer_products?.length).toBeGreaterThan(0);
});
```

---

## Part 5: Implementation Order

### Phase 1: Write Tests (RED)
1. Create `create-customer.test.ts` - migrate old tests + add new null ID tests
2. Create `create-customer-defaults.test.ts` - default product tests
3. Create `create-customer-race.test.ts` - race condition tests
4. Add tests to `check-race-condition2.test.ts` and `track-race-condition5.test.ts`
5. Delete `create-customer1.test.ts` and `create-customer2.test.ts`
6. Run tests - some will fail (documenting expected behavior)

### Phase 2: Type Cleanup
1. Add `CustomerIdSchema` to `customerData.ts`
2. Update `customerOpModels.ts` to use it
3. Update `handleCreateCustomer` signature
4. Update all callers
5. Remove `CreateCustomerSchema` from `cusModels.ts`

### Phase 3: Fix Race Conditions (GREEN)
1. Analyze failing tests
2. Implement proper locking/transactions
3. Potential fixes:
   - Use database transaction for insert + default products
   - Add advisory lock during customer creation
   - Detect stale cache by checking customer_products count

### Phase 4: Verify
1. All tests pass
2. Manual testing of concurrent scenarios
3. Review for any remaining edge cases

---

## Files Summary

### To Create
- `server/tests/integration/crud/customers/create-customer.test.ts`
- `server/tests/integration/crud/customers/create-customer-defaults.test.ts`
- `server/tests/integration/crud/customers/create-customer-race.test.ts`
- `server/tests/integration/balances/check/check-race-condition2.test.ts`
- `server/tests/balances/track/race-condition/track-race-condition5.test.ts`

### To Delete
- `server/tests/integration/crud/customers/create-customer1.test.ts`
- `server/tests/integration/crud/customers/create-customer2.test.ts`

### Type Cleanup (Modify)
- `shared/api/common/customerData.ts` - Add `CustomerIdSchema`
- `shared/api/customers/customerOpModels.ts` - Use `CustomerIdSchema`, remove duplicate
- `shared/models/cusModels/cusModels.ts` - Remove `CreateCustomerSchema`
- `server/src/internal/customers/handlers/handleCreateCustomer.ts` - New signature
- `server/src/internal/customers/cusUtils/getOrCreateCustomer.ts`
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.ts`
- `server/src/internal/customers/cusUtils/createNewCustomer.ts`
- `server/src/internal/customers/handlers/handlePostCustomerV2.ts`
- `server/src/internal/customers/cusUtils/getOrCreateApiCustomer.ts`
