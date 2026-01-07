# Test Writing Guide

## Test Style

- **Always use `test.concurrent()`** - self-contained tests that can run in parallel
- **Never use `describe/beforeAll/test`** - avoid shared state between tests
- **Keep setup inline** - each test should be fully self-contained

## Quick Start

Use `initTestScenario` for the fastest test setup:

```typescript
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("my-feature: descriptive test name")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 500 });
  const free = products.base({ items: [messagesItem] });

  const { customerId, autumnV1, ctx } = await initTestScenario({
    customerId: "my-unique-test-id",
    products: [free],
    attachProducts: [free.id],  // Pass original IDs - auto-prefixed
    customerOptions: {
      withTestClock: true,
      attachPm: "success",
    },
  });

  // Your test logic here
  await autumnV1.track({
    customer_id: customerId,
    feature_id: TestFeature.Messages,
    value: 100,
  });

  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[0].balance).toBe(400);
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

## Test Scenario Initialization

### `initTestScenario`

Combines customer creation, product creation, and attachment into one call.

```typescript
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";

const { customerId, products, autumnV1, autumnV2, testClockId, customer, ctx } = 
  await initTestScenario({
    customerId: "unique-test-id",      // Used as customer ID AND product prefix
    products: [free, addon],           // Products to create
    attachProducts: [free.id],         // Original IDs (auto-prefixed with customerId_)
    customerOptions: {
      withTestClock: true,             // Default: true
      attachPm: "success",             // "success" | "fail" | "authenticate"
      withDefault: false,              // Default: false
      customerData: { fingerprint },   // Optional customer data
    },
  });
```

**Important:** Product IDs are prefixed with `customerId_` for test isolation.
- You pass: `attachProducts: ["base"]`
- Actual product ID becomes: `"my-test-id_base"`

---

## Scenario Builder (`initScenario`)

For complex tests (entities, multiple products), use functional composition:

```typescript
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const { autumnV1, ctx, entities } = await initScenario({
  customerId: "my-test",
  options: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro, free] }),
    s.entities({ count: 2, featureId: TestFeature.Users }),
    s.attach({ productId: "pro", entityIndex: 0 }),
    s.attach({ productId: "free", entityIndex: 1 }),
  ],
});
// entities[0].id = "ent-1", entities[1].id = "ent-2"
```

| Method | Purpose |
|--------|---------|
| `s.customer({ paymentMethod?, testClock?, data?, withDefault? })` | Customer options (testClock defaults to `true`) |
| `s.products({ list })` | Products to create |
| `s.entities({ count, featureId })` | Auto-generate entities (ids: "ent-1", "ent-2", ...) |
| `s.attach({ productId, entityIndex? })` | Attach product (omit entityIndex for customer-level) |
| `s.advanceTestClock({ days?, weeks?, hours?, months?, toNextInvoice? })` | Advance test clock after attachments |

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
