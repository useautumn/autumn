# Scenario Initialization

## `initScenario` Overview

The `initScenario` function is the primary way to set up test scenarios. It handles:
- Customer creation (with optional Stripe test clock)
- Product creation (with unique prefixes for isolation)
- Entity creation
- Product attachments
- Time advancement

```typescript
const { customerId, autumnV1, autumnV2, ctx, testClockId, entities, advancedTo, otherCustomers } = await initScenario({
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
  skipWebhooks?: boolean,   // Skip webhook processing (for webhook tests)
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

### `s.otherCustomers([...])`

Define additional customers that share the same test clock as the primary customer. No new test clock is created.

```typescript
s.otherCustomers([
  { id: "cus-b", paymentMethod: "success" },
  { id: "cus-c", paymentMethod: "fail", data: { name: "Customer C" } },
])
```

Access after init:
```typescript
const { otherCustomers } = await initScenario({ ... });
// otherCustomers is Map<string, OtherCustomerResult>
```

### `s.deleteCustomer({ ... })`

Pre-test cleanup — delete a customer before creating. Silently ignores if customer doesn't exist.

```typescript
// Delete by customer ID
s.deleteCustomer({ customerId: "old-customer" })

// Delete by email — removes ALL customers with that email
s.deleteCustomer({ email: "test@example.com" })
```

### `s.reward({ ... })`

Define a standalone reward/coupon. Reward ID is auto-suffixed with productPrefix.

```typescript
s.reward({
  reward: CreateReward,   // Reward configuration
  productId: string,      // Apply to specific product
})
```

### `s.referralProgram({ ... })`

Define a referral program. IDs are auto-suffixed with productPrefix. `program.product_ids` are also prefixed.

```typescript
s.referralProgram({
  reward: CreateReward,          // Reward config
  program: CreateRewardProgram,  // Program config with product_ids
})
```

## Action Functions (`s.*`)

Actions execute **in order**. You can interleave different action types.

### Timeout Behavior Table

**CRITICAL: Know which actions wait and which don't.**

| Function | Built-in Timeout | Type |
|----------|-----------------|------|
| `s.billing.attach` | **5-8s** | Request timeout |
| `s.attach` | **4-5s** | Post-request sleep |
| `s.billing.multiAttach` | **2-5s** | Request timeout |
| `s.cancel` | **None** | — |
| `s.track` | **None** — must pass `timeout` | Post-request sleep |
| `s.advanceTestClock` | Waits for Stripe | — |
| `s.advanceToNextInvoice` | **30s** | Advances 1mo + 96h |
| `s.updateSubscription` | **None** | — |
| `s.attachPaymentMethod` | **None** | — |
| `s.removePaymentMethod` | **None** | — |
| `s.resetFeature` | **2s default** | Post-request sleep |
| `s.referral.createCode` | **None** | — |
| `s.referral.redeem` | **None** | — |

### `s.billing.attach({ ... })` — V2 Billing Endpoint

```typescript
s.billing.attach({
  productId: pro.id,              // Use product.id, NOT string literals
  customerId?: string,            // Override customer (for otherCustomers)
  entityIndex?: 0,                // 0-based index into entities array
  options?: [{                    // For prepaid items
    feature_id: TestFeature.Messages,
    quantity: 200,                // INCLUSIVE of includedUsage
  }],
  newBillingSubscription?: true,  // Create separate Stripe subscription
  planSchedule?: "immediate" | "end_of_cycle",  // V2-only
  items?: ProductItem[],          // V2-only: custom plan items
  timeout?: 5000,                 // Override default timeout (ms)
})
```

### `s.attach({ ... })` — V1 Legacy Endpoint

```typescript
s.attach({
  productId: pro.id,              // Use product.id, NOT string literals
  customerId?: string,            // Override customer
  entityIndex?: 0,                // 0-based index into entities array
  options?: [{                    // For prepaid items
    feature_id: TestFeature.Messages,
    quantity: 200,                // EXCLUSIVE of includedUsage
  }],
  newBillingSubscription?: true,  // Create separate Stripe subscription
  timeout?: 5000,                 // Override default timeout (ms)
})
```

### `s.billing.attach` vs `s.attach` — THEY ARE DIFFERENT

| | `s.attach` | `s.billing.attach` |
|---|---|---|
| **Endpoint** | V1 `/attach` | V2 `/billing.attach` |
| **Extra params** | none | `planSchedule`, `items` |
| **Prepaid quantity** | **Exclusive** of `includedUsage` | **Inclusive** of `includedUsage` |
| **Default timeout** | 4-5s (post-request sleep) | 5-8s (request timeout) |
| **Use when** | Legacy tests, update-subscription setup | New billing/attach tests |

### `s.billing.multiAttach({ ... })`

Attach multiple products at once.

```typescript
s.billing.multiAttach({
  plans: [
    { productId: pro.id, featureQuantities?: [{ feature_id: TestFeature.Messages, quantity: 200 }] },
    { productId: addon.id },
  ],
  entityIndex?: 0,
  freeTrial?: { length: 14, duration: "day", card_required: true },
  timeout?: 5000,
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

### `s.track({ ... })`

Track feature usage. **No built-in timeout** — pass `timeout` explicitly if you need side effects to settle.

```typescript
s.track({
  featureId: TestFeature.Messages,
  value: 50,
  entityIndex?: 0,
  timeout?: 2000,  // MUST be passed explicitly if needed
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

### `s.advanceToNextInvoice({ ... })`

Advance to next billing cycle + 96h for invoice finalization. ~30s timeout.

```typescript
s.advanceToNextInvoice({ withPause?: boolean })
```

### `s.updateSubscription({ ... })`

Update an existing subscription. No timeout.

```typescript
s.updateSubscription({
  productId: pro.id,
  entityIndex?: 0,
  cancelAction?: "cancel_end_of_cycle" | "cancel_immediately" | "uncancel",
  items?: ProductItem[],  // Custom item changes
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

### `s.resetFeature({ ... })`

Reset a feature's usage cycle to simulate end-of-cycle rollover creation.
**Use this for FREE products** (no Stripe subscription) to create rollovers.
For PAID products, use `s.advanceToNextInvoice()` instead.

```typescript
s.resetFeature({
  featureId: TestFeature.Messages,  // Required: feature to reset
  productId?: "free",               // Optional: product ID (defaults to customerId as group)
  timeout?: 2000,                   // Optional: wait time after reset (default: 2000ms)
})
```

### `s.referral.createCode()`

Create a referral code. No timeout.

```typescript
s.referral.createCode()
```

### `s.referral.redeem({ ... })`

Redeem a referral code for another customer. No timeout.

```typescript
s.referral.redeem({ customerId: "cus-b" })
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
  otherCustomers, // Map<string, OtherCustomerResult>
} = await initScenario({ ... });
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
// product.id is MUTATED to "pro_test-123"
```

The `s.attach()` handles this automatically when you use `productId: pro.id`.

### Multiple Customers — NEVER Call initScenario Twice

```typescript
// ✅ Using s.otherCustomers
const { autumnV1, otherCustomers } = await initScenario({
  customerId: "cus-a",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro] }),
    s.otherCustomers([{ id: "cus-b", paymentMethod: "success" }]),
  ],
  actions: [s.billing.attach({ productId: pro.id })],
});

// ✅ Or create manually
await autumnV1.customers.create("cus-b", { name: "B" });
await autumnV1.billing.attach({ customer_id: "cus-b", product_id: pro.id });
```

## AutumnInt Generic Types (IMPORTANT)

**ALWAYS use generic type parameters** when calling `AutumnInt` methods:

| Client | Method | Type Parameter |
|--------|--------|----------------|
| `autumnV1` | `.customers.get<T>()` | `ApiCustomerV3` |
| `autumnV1` | `.entities.get<T>()` | `ApiEntityV0` |
| `autumnV1` | `.check<T>()` | `CheckResponseV1` |
| `autumnV2` | `.customers.get<T>()` | `ApiCustomer` |
| `autumnV2` | `.entities.get<T>()` | `ApiEntityV1` |
| `autumnV2` | `.check<T>()` | `CheckResponseV2` |

```typescript
// ✅ GOOD
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

// ❌ BAD
const customer = await autumnV1.customers.get(customerId) as unknown as ApiCustomerV3;
```

## Setup vs Test Body

**Rule:** Put setup actions in `initScenario.actions`, keep only the behavior under test in the test body.

```typescript
// ✅ GOOD — prerequisite in initScenario, only tested action in body
const { autumnV1 } = await initScenario({
  actions: [
    s.billing.attach({ productId: premium.id }),
    s.billing.attach({ productId: pro.id }), // Downgrade is setup
  ],
});

// The actual test: cancel behavior
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: premium.id,
  cancel: "end_of_cycle",
});
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

// WRONG: expect(trialEndsAt).toBeCloseTo(Date.now() + ms.days(14));
// CORRECT: expect(trialEndsAt).toBeCloseTo(advancedTo + ms.days(14));
```

## Resetting Features: Free vs Paid

- **Free products** (no Stripe sub): `s.resetFeature({ featureId, productId })` — simulates cron
- **Paid products** (has Stripe sub): `s.advanceToNextInvoice()` — advances clock, triggers `invoice.paid`

```typescript
// Free product rollover
actions: [
  s.billing.attach({ productId: free.id }),
  s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
  s.resetFeature({ featureId: TestFeature.Messages, productId: free.id }),
]

// Paid product cycle renewal
actions: [
  s.billing.attach({ productId: pro.id }),
  s.advanceToNextInvoice(),
]
```
