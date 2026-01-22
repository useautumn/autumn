# Scenario Initialization

## `initScenario` Overview

The `initScenario` function is the primary way to set up test scenarios. It handles:
- Customer creation (with optional Stripe test clock)
- Product creation (with unique prefixes for isolation)
- Entity creation
- Product attachments
- Time advancement

```typescript
const { customerId, autumnV1, autumnV2, ctx, testClockId, entities, advancedTo } = await initScenario({
  customerId: "unique-test-id",  // MUST be unique across all tests
  setup: [...],                   // Configuration functions
  actions: [...],                 // Actions to execute in order
});
```

## Setup Functions (`s.*`)

### `s.customer({ ... })`

Configure the customer being created.

```typescript
s.customer({
  paymentMethod?: "success" | "fail" | "authenticate",  // Attach PM type
  testClock?: boolean,      // Default: true - enables Stripe test clock
  data?: CustomerData,      // Custom metadata (fingerprint, name, email)
  withDefault?: boolean,    // Attach default product on creation
})
```

**Important:** `testClock` defaults to `true`. You don't need to pass it unless disabling.

### `s.products({ ... })`

Define products to create for this test.

```typescript
s.products({
  list: [pro, free, addon],           // Array of ProductV2 objects
  customerIdsToDelete?: [customerId], // Clean up before creating
})
```

Products are automatically prefixed with `customerId` for test isolation.
- If you define `products.pro({ id: "pro" })` and customerId is `"my-test"`, the actual product ID becomes `"pro_my-test"`.

### `s.entities({ ... })`

Auto-generate entities for multi-tenant testing.

```typescript
s.entities({
  count: 3,                      // Creates "ent-1", "ent-2", "ent-3"
  featureId: TestFeature.Users,  // Feature ID for all entities
})
```

## Action Functions (`s.*`)

Actions execute **in order**. You can interleave different action types.

### `s.attach({ ... })`

Attach a product to customer or entity.

```typescript
s.attach({
  productId: pro.id,              // Use product.id, NOT string literals
  entityIndex?: 0,                // 0-based index into entities array
  options?: [{                    // For prepaid items
    feature_id: TestFeature.Messages,
    quantity: 200,
  }],
  newBillingSubscription?: true,  // Create separate Stripe subscription
  timeout?: 5000,                 // Wait after attach (ms)
})
```

### `s.cancel({ ... })`

Cancel a product subscription.

```typescript
s.cancel({
  productId: pro.id,
  entityIndex?: 0,  // For entity-level cancellation
})
```

### `s.advanceTestClock({ ... })`

Advance Stripe test clock. Multiple calls are cumulative.

```typescript
s.advanceTestClock({
  days?: 15,
  weeks?: 2,
  hours?: 6,
  months?: 1,
  toNextInvoice?: true,  // Advance to next billing cycle + finalization
})
```

### `s.attachPaymentMethod({ ... })`

Change payment method mid-scenario.

```typescript
s.attachPaymentMethod({ type: "success" })   // Working card
s.attachPaymentMethod({ type: "fail" })      // Declining card
s.attachPaymentMethod({ type: "authenticate" })  // 3DS required
```

### `s.removePaymentMethod()`

Remove all payment methods from customer.

```typescript
s.removePaymentMethod()
```

## Complete Example

```typescript
test.concurrent(`${chalk.yellowBright("upgrade: pro mid-cycle then cancel")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });
  const free = products.base({ items: [messagesItem] });

  const { customerId, autumnV1, advancedTo } = await initScenario({
    customerId: "upgrade-cancel-test",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro, free] }),
    ],
    actions: [
      s.attach({ productId: free.id }),        // Start with free
      s.advanceTestClock({ days: 15 }),        // Mid-cycle
      s.attach({ productId: pro.id }),         // Upgrade to pro
      s.advanceTestClock({ days: 5 }),         // 5 more days
      s.cancel({ productId: pro.id }),         // Cancel
    ],
  });

  // advancedTo = timestamp after all clock advancements (20 days total)
  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  // ... verify state
});
```

## Product Configuration Rules

### Product ID Usage

**ALWAYS use `product.id`:**
```typescript
// GOOD
s.attach({ productId: pro.id })
s.cancel({ productId: pro.id })

// BAD - Don't use strings
s.attach({ productId: "pro" })  // Wrong!
```

### Product Prefixing

Products are auto-prefixed with customerId:
```typescript
const pro = products.pro({ id: "pro" });  // id = "pro"
// After initScenario with customerId "test-123":
// Actual product ID in Autumn = "pro_test-123"
```

The `s.attach()` handles this automatically when you use `productId: pro.id`.

### Building Products

Use fixtures, add items as needed:

```typescript
// Free product (no base price)
const free = products.base({
  id: "free",
  items: [items.monthlyMessages({ includedUsage: 100 })],
});

// Pro product (has $20/mo base price built-in)
const pro = products.pro({
  items: [items.monthlyMessages({ includedUsage: 1000 })],
});

// Custom pricing - use products.base and add price item
const custom = products.base({
  id: "custom",
  items: [
    items.monthlyPrice({ price: 30 }),
    items.monthlyMessages({ includedUsage: 500 }),
    items.prepaidUsers({ includedUsage: 0 }),
  ],
});
```

## Prepaid/Allocated Items

Prepaid and allocated items require `options` with `quantity`:

```typescript
const prepaidItem = items.prepaidMessages({ billingUnits: 100, price: 10 });
const pro = products.base({ id: "pro", items: [prepaidItem] });

await initScenario({
  // ...
  actions: [
    s.attach({
      productId: pro.id,
      options: [{ feature_id: TestFeature.Messages, quantity: 200 }],  // 2 packs
    }),
  ],
});
```

## Returned Values

```typescript
const {
  customerId,     // The customer ID used
  autumnV1,       // Autumn client (v1.2)
  autumnV2,       // Autumn client (v2.0)
  ctx,            // Test context (db, stripeCli, org, env)
  testClockId,    // Stripe test clock ID (if enabled)
  customer,       // Customer object after creation
  entities,       // Array of generated entities [{id, name, featureId}]
  advancedTo,     // Timestamp after all clock advancements
} = await initScenario({ ... });
```

## Setup vs Test Body

**Rule:** Put setup actions in `initScenario.actions`, keep only the behavior under test in the test body.

Ask: "What is the test actually testing?" Everything else is setup.

```typescript
// ❌ BAD - Downgrade is setup, not what we're testing
const { autumnV1 } = await initScenario({
  actions: [s.attach({ productId: premium.id })],
});

// Setup in test body (wrong place)
await autumnV1.attach({ customer_id: customerId, product_id: pro.id });

// The actual test: cancel behavior
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: premium.id,
  cancel: "end_of_cycle",
});

// ✅ GOOD - Setup in initScenario, only test behavior in body
const { autumnV1 } = await initScenario({
  actions: [
    s.attach({ productId: premium.id }),
    s.attach({ productId: pro.id }), // Downgrade is setup
  ],
});

// The actual test: cancel behavior
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: premium.id,
  cancel: "end_of_cycle",
});
```

**Benefits:**
- Clearer test intent - reader immediately sees what's being tested
- Less verification boilerplate - no need to verify setup worked
- Faster test writing - `s.*` builders handle common patterns
## AutumnInt Generic Types (IMPORTANT)

**ALWAYS use generic type parameters** when calling `AutumnInt` methods to get proper type safety:

| Client | Method | Type Parameter |
|--------|--------|----------------|
| `autumnV1` | `.customers.get<T>()` | `ApiCustomerV3` |
| `autumnV1` | `.entities.get<T>()` | `ApiEntityV0` |
| `autumnV1` | `.check<T>()` | `CheckResponseV1` |
| `autumnV2` | `.customers.get<T>()` | `ApiCustomer` |
| `autumnV2` | `.entities.get<T>()` | `ApiEntityV1` |
| `autumnV2` | `.check<T>()` | `CheckResponseV2` |

```typescript
// ✅ GOOD - Use generic types
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
const checkRes = await autumnV1.check<CheckResponseV1>({ ... });
const entity = await autumnV2.entities.get<ApiEntityV1>(entityId);

// ❌ BAD - Casting with `as unknown as`
const customer = await autumnV1.customers.get(customerId) as unknown as ApiCustomerV3;
const checkRes = (await autumnV1.check({ ... })) as unknown as CheckResponseV1;
```

Import the types from `@autumn/shared`:
```typescript
import {
  type ApiCustomerV3,
  type ApiCustomer,
  type ApiEntityV0,
  type ApiEntityV1,
  type CheckResponseV1,
  type CheckResponseV2,
} from "@autumn/shared";
```

## Test Clock Timing

**Critical:** `Date.now()` doesn't change when using test clocks. Use `advancedTo`:

```typescript
const { advancedTo } = await initScenario({
  actions: [
    s.attach({ productId: pro.id }),
    s.advanceTestClock({ days: 7 }),
  ],
});

// WRONG
expect(trialEndsAt).toBeCloseTo(Date.now() + ms.days(14));

// CORRECT
expect(trialEndsAt).toBeCloseTo(advancedTo + ms.days(14));
```
