# Test Writing Guide

## Test Style

- **Always use `test.concurrent()`** - self-contained tests that can run in parallel
- **Never use `describe/beforeAll/test`** - avoid shared state between tests
- **Keep setup inline** - each test should be fully self-contained

## Quick Start

Use `initScenario` with the scenario builder (`s.*`) for test setup:

```typescript
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("my-feature: descriptive test name")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 500 });
  const free = products.base({ items: [messagesItem] });

  const { customerId, autumnV1, ctx } = await initScenario({
    customerId: "my-unique-test-id",
    setup: [
      s.customer({ paymentMethod: "success" }), // testClock defaults to true
      s.products({ list: [free] }),
    ],
    actions: [s.attach({ productId: "base" })],
  });

  // Your test logic here
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: 100,
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(400);
});
```

---

## Fixtures

### Item Fixtures (`@tests/utils/fixtures/items`)

Pre-configured product items for common feature types:

```typescript
import { items } from "@tests/utils/fixtures/items.js";
```

| Item | Description | Default |
|------|-------------|---------|
| `items.dashboard()` | Boolean feature (on/off) | - |
| `items.monthlyMessages({ includedUsage })` | Resets monthly | 100 |
| `items.monthlyWords({ includedUsage })` | Resets monthly | 100 |
| `items.monthlyCredits({ includedUsage })` | Resets monthly | 100 |
| `items.unlimitedMessages()` | No usage cap | - |
| `items.lifetimeMessages({ includedUsage })` | Never resets | 100 |
| `items.prepaidMessages({ includedUsage })` | Buy upfront ($10/unit) | 0 |
| `items.consumableMessages({ includedUsage })` | Pay-per-use ($0.10/unit) | 0 |
| `items.allocatedUsers({ includedUsage })` | Prorated seats ($10/seat) | 0 |

### Product Fixtures (`@tests/utils/fixtures/products`)

```typescript
import { products } from "@tests/utils/fixtures/products.js";
```

| Product | Description |
|---------|-------------|
| `products.base({ items, id?, isDefault? })` | No base price. Defaults: `id="base"`, `isDefault=false` |
| `products.pro({ items, id? })` | **Includes $20/mo base price** - don't add `monthlyPrice()`. Default: `id="pro"` |
| `products.proAnnual({ items, id? })` | **Includes $200/yr base price**. Default: `id="pro-annual"` |

**Example:**
```typescript
// Free product (no price)
const free = products.base({ items: [items.monthlyMessages()] });

// Pro product - already has $20/mo, just add features
const pro = products.pro({ items: [items.monthlyMessages()] });
```

---

## Scenario Builder (`initScenario`) - Recommended

Use functional composition with `setup` and `actions` arrays for flexible test configuration:

```typescript
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const { customerId, autumnV1, autumnV2, ctx, testClockId, entities } = await initScenario({
  customerId: "my-test",
  setup: [
    s.customer({ paymentMethod: "success" }), // testClock is true by default
    s.products({ list: [pro, free] }),
    s.entities({ count: 2, featureId: TestFeature.Users }), // optional
  ],
  actions: [
    s.attach({ productId: "pro", entityIndex: 0 }),
    s.attach({ productId: "free", entityIndex: 1 }),
    s.advanceTestClock({ days: 15 }), // optional
  ],
});
// entities[0].id = "ent-1", entities[1].id = "ent-2"
```

### Setup Methods (`s.*`)

| Method | Purpose |
|--------|---------|
| `s.customer({ paymentMethod?, data?, withDefault?, testClock? })` | Customer options. **`testClock` defaults to `true`** - don't pass it unless disabling |
| `s.products({ list })` | Products to create |
| `s.entities({ count, featureId })` | Auto-generate entities (ids: "ent-1", "ent-2", ...) |

> **Note:** `testClock` defaults to `true` - you don't need to pass `testClock: true` in most tests.

### Action Methods (`s.*`)

| Method | Purpose |
|--------|---------|
| `s.attach({ productId, entityIndex? })` | Attach product (omit entityIndex for customer-level) |
| `s.cancel({ productId, entityIndex? })` | Cancel product subscription |
| `s.advanceTestClock({ days?, weeks?, hours?, months?, toNextInvoice? })` | Advance test clock after attachments |

### Examples

**Simple test (no entities):**
```typescript
const { customerId, autumnV1 } = await initScenario({
  customerId: "simple-test",
  setup: [
    s.customer({}), // testClock defaults to true
    s.products({ list: [free] }),
  ],
  actions: [s.attach({ productId: "base" })],
});
```

**With payment method:**
```typescript
const { customerId, autumnV1, ctx } = await initScenario({
  customerId: "paid-test",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro] }),
  ],
  actions: [s.attach({ productId: "pro" })],
});
```

**With entities:**
```typescript
const { customerId, autumnV1, entities } = await initScenario({
  customerId: "entity-test",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro, free] }),
    s.entities({ count: 2, featureId: TestFeature.Users }),
  ],
  actions: [
    s.attach({ productId: "pro", entityIndex: 0 }),
    s.attach({ productId: "free", entityIndex: 1 }),
  ],
});
// entities[0].id = "ent-1", entities[1].id = "ent-2"
```

**With clock advancement:**
```typescript
const { customerId, autumnV1, advancedTo } = await initScenario({
  customerId: "clock-test",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro] }),
  ],
  actions: [
    s.attach({ productId: "pro" }),
    s.advanceTestClock({ days: 15 }),
  ],
});
```

---

## Product ID Prefixing

**Important:** Product IDs are automatically prefixed with `customerId_` for test isolation.

- In `s.attach()`: Use the **unprefixed** product ID (e.g., `"base"`, `"pro"`)
- In API calls after setup: Use `product.id` which includes the prefix

```typescript
const free = products.base({ items: [messagesItem] }); // id = "base"

const { customerId, autumnV1 } = await initScenario({
  customerId: "my-test",
  setup: [s.products({ list: [free] })],
  actions: [s.attach({ productId: "base" })], // Use "base" (unprefixed)
});

// For subsequent API calls, use free.id which is prefixed
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: free.id, // "my-test_base" (prefixed)
  items: [newItem],
});
```

---

## Prepaid Items

**Prepaid items require a `quantity` in `options`** when calling `subscriptions.update` or `subscriptions.previewUpdate`:

```typescript
const prepaidItem = items.prepaidMessages(); // $10 per 100 units (billingUnits: 100)

// IMPORTANT: quantity is inclusive of billing units
// quantity: 100 with billingUnits: 100 = 100 credits
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: productId,
  items: [prepaidItem],
  options: [
    {
      feature_id: TestFeature.Messages,
      quantity: 100, // Gets you 100 credits
    },
  ],
});
```

**Key rule:** Prepaid `quantity` is the **total credits** you want, not multiplied by billing units.

---

## Legacy: `initTestScenario`

For simpler cases without entities, `initTestScenario` is still available but `initScenario` is preferred:

```typescript
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";

const { customerId, autumnV1, ctx } = await initTestScenario({
  customerId: "unique-test-id",
  products: [free, addon],
  attachProducts: [free.id],  // Original IDs (auto-prefixed)
  customerOptions: {
    withTestClock: true,
    attachPm: "success",
  },
});
```

---

## Manual Setup (when initScenario doesn't fit)

### Customer Initialization

```typescript
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

await initCustomerV3({
  ctx,
  customerId,
  customerData: { fingerprint: "test" },
  withTestClock: true,
  withDefault: true,  // Attach default product on creation
  attachPm: "success",
});
```

### Product Initialization (Direct)

```typescript
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

await initProductsV0({
  ctx,
  products: [free, pro],
  prefix: customerId,  // Prefix product IDs for isolation
});
```

---

## Running Tests

### Run specific test block
Place cursor inside a `test.concurrent()` block and press `Cmd+T`.

### Rerun last test
`Cmd+Shift+P` → "Rerun Last Task"

### Run entire file
```bash
bun test path/to/file.test.ts
```

---

## Code Style

### Avoid Parameter Duplication

When calling similar methods (like `previewUpdate` + `update`), define params once and reuse:

```typescript
// ❌ BAD - Duplicated params
const preview = await autumnV1.subscriptions.previewUpdate({
  customer_id: customerId,
  product_id: pro.id,
  items: [prepaidItem, priceItem],
  options: [{ feature_id: TestFeature.Users, quantity: 10 }],
});

await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: pro.id,
  items: [prepaidItem, priceItem],
  options: [{ feature_id: TestFeature.Users, quantity: 10 }],
});

// ✅ GOOD - Define once, reuse
const updateParams = {
  customer_id: customerId,
  product_id: pro.id,
  items: [prepaidItem, priceItem],
  options: [{ feature_id: TestFeature.Users, quantity: 10 }],
};

const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
await autumnV1.subscriptions.update(updateParams);
```
