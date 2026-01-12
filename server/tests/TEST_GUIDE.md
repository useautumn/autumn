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

## Product ID in `s.attach()`

**Important:** Always use the product variable's `.id` property in `s.attach()`, never a string literal.

```typescript
const free = products.base({ items: [messagesItem] });
const pro = products.pro({ items: [messagesItem] });

// ✅ GOOD - Use product.id
actions: [
  s.attach({ productId: free.id }),
  s.attach({ productId: pro.id }),
]

// ❌ BAD - Don't use string literals
actions: [
  s.attach({ productId: "base" }),    // Wrong!
  s.attach({ productId: "pro" }),     // Wrong!
]
```

This ensures consistency and prevents bugs when product IDs change. The same `product.id` is used for both `s.attach()` and subsequent API calls.

---

## Prepaid Items

**Prepaid items require a `quantity` in `options`** when attaching or updating:

```typescript
const prepaidItem = items.prepaidMessages({
  includedUsage: 0,
  billingUnits: 100,  // 1 pack = 100 units
  price: 10,          // $10 per pack
});
```

### Key Rules

1. **`quantity` is the total units you want** - NOT multiplied by billing units
2. **`quantity` is separate from `included_usage`** - included_usage provides free balance, quantity is purchased balance
3. **Balance = included_usage + quantity - usage**

### Attaching Prepaid Products

```typescript
// Attach with 200 units purchased (2 packs)
await initScenario({
  actions: [
    s.attach({
      productId: "pro",
      options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
    }),
  ],
});
```

### Updating Prepaid Quantities

```typescript
// Upgrade from 200 to 500 units
const updateParams = {
  customer_id: customerId,
  product_id: pro.id,
  options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
};

const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
// preview.total = (5 packs - 2 packs) * $10 = $30

await autumnV1.subscriptions.update(updateParams);
```

### Prepaid Billing Logic

On update, the system:
1. Refunds previous prepaid: `old_packs * old_price`
2. Charges new prepaid: `new_packs * new_price`
3. `preview.total = new_charge - old_refund`

```typescript
// Old: 2 packs * $10 = $20
// New: 5 packs * $10 = $50
// preview.total = $50 - $20 = $30 (charge)
expect(preview.total).toBe(30);

// Old: 5 packs * $10 = $50
// New: 2 packs * $10 = $20
// preview.total = $20 - $50 = -$30 (credit)
expect(preview.total).toBe(-30);
```

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
