# Test Writing Guide

## Quick Start

Use `initTestScenario` for the fastest test setup:

```typescript
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";

test.concurrent("my test", async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 500 });

  const free = products.base({ items: [messagesItem] });

  const { customerId, autumnV1 } = await initTestScenario({
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
| `products.base({ items, id?, isDefault? })` | No base price, `id` defaults to "base", `isDefault` defaults to `false` |

**Example:**
```typescript
// Simple product
const free = products.base({ items: [items.monthlyMessages()] });

// With custom ID
const addon = products.base({ 
  id: "messages-addon", 
  items: [items.prepaidMessages()] 
});

// As default product
const defaultProd = products.base({ 
  items: [items.dashboard()], 
  isDefault: true 
});
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

## Legacy Patterns

### Customer Initialization (Direct)

For cases where `initTestScenario` doesn't fit:

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
Place cursor inside a `test.concurrent()` or `describe()` block and press `Cmd+T`.

### Rerun last test
`Cmd+Shift+P` → "Rerun Last Task"

### Run entire file
```bash
bun test path/to/file.test.ts
```
