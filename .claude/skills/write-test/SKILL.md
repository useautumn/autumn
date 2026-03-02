---
name: write-test
description: Write integration tests for Autumn billing. Covers initScenario setup, billing/attach/track/check endpoints, subscription updates, assertion utilities, and common billing test patterns. Use when creating tests, writing test scenarios, debugging test failures, or when the user asks about testing.
---

# Test Writing Guide

## Before Writing ANY Test

1. **Search for duplicate scenarios** — grep the test directory for similar setups
2. **Read the rules file** `.claude/rules/write-tests.mdc` — the 20 rules agents ALWAYS get wrong

## Minimal Template

```typescript
import { expect, test } from "bun:test";
import { type ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("feature: description")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });

  const { customerId, autumnV1, ctx } = await initScenario({
    customerId: "unique-test-id",
    setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro] })],
    actions: [s.billing.attach({ productId: pro.id })],
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  expectCustomerFeatureCorrect({ customer, featureId: TestFeature.Messages, balance: 100 });
  await expectStripeSubscriptionCorrect({ ctx, customerId });
});
```

## initScenario — The Core System

`initScenario` creates customers, products, entities, and runs actions sequentially. It returns everything you need.

### Returned Values

```typescript
const {
  customerId,     // Customer ID (auto-prefixed products)
  autumnV1,       // V1.2 API client
  autumnV2,       // V2.0 API client
  ctx,            // { db, stripeCli, org, env, features }
  testClockId,    // Stripe test clock ID
  customer,       // Customer object after creation
  entities,       // [{ id: "ent-1", name: "Entity 1", featureId }]
  advancedTo,     // Current test clock timestamp (ms)
  otherCustomers, // Map<string, OtherCustomerResult>
} = await initScenario({ ... });
```

### Setup Functions

| Function | Purpose | Notes |
|----------|---------|-------|
| `s.customer({ paymentMethod?, testClock?, data?, withDefault?, skipWebhooks? })` | Configure customer | `testClock` defaults `true`. Use `paymentMethod: "success"` for any paid product |
| `s.products({ list, customerIdsToDelete? })` | Products to create | Auto-prefixed with `customerId` |
| `s.entities({ count, featureId })` | Generate entities | Creates "ent-1" through "ent-N" |
| `s.otherCustomers([{ id, paymentMethod? }])` | Additional customers | Share same test clock as primary |
| `s.deleteCustomer({ customerId } \| { email })` | Pre-test cleanup | Delete before creating |
| `s.reward({ reward, productId })` | Standalone reward | ID auto-suffixed |
| `s.referralProgram({ reward, program })` | Referral program | IDs auto-suffixed |

### Action Functions — WITH TIMEOUT BEHAVIOR

**CRITICAL: Know which actions have built-in timeouts and which don't.**

| Function | Built-in Timeout | Notes |
|----------|-----------------|-------|
| `s.billing.attach({ productId, options?, planSchedule?, items?, newBillingSubscription? })` | **5-8s** | V2 endpoint. Use for new billing tests |
| `s.attach({ productId, entityIndex?, options?, newBillingSubscription? })` | **4-5s** | V1 endpoint. Use for legacy/update-subscription setup |
| `s.billing.multiAttach({ plans, entityIndex?, freeTrial? })` | **2-5s** | `plans: [{ productId, featureQuantities? }]` |
| `s.cancel({ productId, entityIndex? })` | **None** | No timeout |
| `s.track({ featureId, value, entityIndex?, timeout? })` | **None** | Must pass `timeout` explicitly if needed |
| `s.advanceTestClock({ days?, weeks?, hours?, months? })` | Waits for Stripe | Cumulative from `advancedTo` |
| `s.advanceToNextInvoice({ withPause? })` | **30s** | Advances 1 month + 96h for invoice finalization |
| `s.updateSubscription({ productId, entityIndex?, cancelAction?, items? })` | **None** | cancel_end_of_cycle, cancel_immediately, uncancel |
| `s.attachPaymentMethod({ type })` | **None** | "success", "fail", "authenticate" |
| `s.removePaymentMethod()` | **None** | Remove all PMs |
| `s.resetFeature({ featureId, productId?, timeout? })` | **2s default** | For FREE products only. Use `s.advanceToNextInvoice` for paid |
| `s.referral.createCode()` | **None** | Create referral code |
| `s.referral.redeem({ customerId })` | **None** | Redeem for another customer |

### `s.billing.attach` vs `s.attach` — They Are DIFFERENT

| | `s.attach` | `s.billing.attach` |
|---|---|---|
| **Endpoint** | V1 `/attach` | V2 `/billing.attach` |
| **Extra params** | none | `planSchedule`, `items` (custom plan) |
| **Prepaid quantity** | **Exclusive** of `includedUsage` | **Inclusive** of `includedUsage` |
| **Use when** | Legacy tests, update-subscription setup | New billing/attach tests |

### Product ID Prefixing

`initScenario` mutates product objects in-place: `product.id` becomes `"${product.id}_${customerId}"`. So `pro.id` after `initScenario` already includes the prefix. Use `product.id` everywhere — in `s.attach()`, in direct API calls, and in assertions.

### Multiple Customers — NEVER Call initScenario Twice

```typescript
// Use s.otherCustomers in setup
const { autumnV1, otherCustomers } = await initScenario({
  customerId: "cus-a",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro] }),
    s.otherCustomers([{ id: "cus-b", paymentMethod: "success" }]),
  ],
  actions: [s.billing.attach({ productId: pro.id })],
});

// Or create manually after initScenario
await autumnV1.customers.create("cus-b", { name: "B" });
await autumnV1.billing.attach({ customer_id: "cus-b", product_id: pro.id });
```

## Assertion Utilities — ALWAYS Use These

### Product State

```typescript
import { expectCustomerProducts, expectProductActive, expectProductCanceling,
  expectProductScheduled, expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";

// PREFERRED — batch check multiple products in one call
await expectCustomerProducts({
  customer,
  active: [pro.id],
  canceling: [premium.id],    // "canceling" = status:active + canceled_at set
  scheduled: [free.id],
  notPresent: [oldProduct.id],
});

// Single product checks
await expectProductActive({ customer, productId: pro.id });
await expectProductCanceling({ customer, productId: premium.id });
await expectProductScheduled({ customer, productId: free.id });
await expectProductNotPresent({ customer, productId: pro.id });
```

### Features

```typescript
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";

// IMPORTANT: requires `customer` object, does NOT fetch from API
expectCustomerFeatureCorrect({
  customer,                        // MUST be fetched customer object, not customerId
  featureId: TestFeature.Messages,
  includedUsage: 100,              // optional
  balance: 100,                    // optional
  usage: 0,                        // optional
  resetsAt: advancedTo + ms.days(30), // optional, 10min tolerance
});
```

### Invoices

```typescript
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";

expectCustomerInvoiceCorrect({
  customer,          // ApiCustomerV3
  count: 2,          // Total invoice count
  latestTotal: 30,   // Most recent invoice total ($), +-0.01 tolerance
  latestStatus: "paid",
});
```

### Stripe Subscription (ALWAYS call after billing actions)

```typescript
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";

// Basic — verify all subscriptions match expected state
await expectStripeSubscriptionCorrect({ ctx, customerId });

// With options
await expectStripeSubscriptionCorrect({
  ctx, customerId,
  options: { subCount: 1, status: "trialing", debug: true },
});
```

For free products, use `expectNoStripeSubscription` instead:
```typescript
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
await expectNoStripeSubscription({ db: ctx.db, customerId, org: ctx.org, env: ctx.env });
```

### Trials

```typescript
import { expectProductTrialing, expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";

const trialEndsAt = await expectProductTrialing({
  customer, productId: pro.id, trialEndsAt: advancedTo + ms.days(7),
});
await expectProductNotTrialing({ customer, productId: pro.id });
```

### Preview Next Cycle

```typescript
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";

expectPreviewNextCycleCorrect({ preview, startsAt: addMonths(advancedTo, 1).getTime(), total: 20 });
// Or when next_cycle should NOT exist:
expectPreviewNextCycleCorrect({ preview, expectDefined: false });
```

### Proration

```typescript
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";

const expected = await calculateProratedDiff({
  customerId, advancedTo, oldAmount: 20, newAmount: 50,
});
expect(preview.total).toBeCloseTo(expected, 0);
```

### Invoice Line Items (for tests verifying stored line items)

```typescript
import { expectInvoiceLineItemsCorrect, expectBasePriceLineItem } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";

// Full check with per-item expectations
await expectInvoiceLineItemsCorrect({
  stripeInvoiceId: invoice.stripe_id,
  expectedTotal: 20,
  expectedCount: 2,
  expectedLineItems: [
    { isBasePrice: true, amount: 20, direction: "charge" },
    { featureId: TestFeature.Messages, totalAmount: 0 },
  ],
});

// Quick base price check
await expectBasePriceLineItem({ stripeInvoiceId, amount: 20 });
```

### Error Testing

```typescript
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";

await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: () => autumnV1.customers.get("invalid-id"),
});
```

### Cache vs DB Verification

```typescript
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb";

await expectFeatureCachedAndDb({
  autumn: autumnV1, customerId,
  featureId: TestFeature.Messages, balance: 90, usage: 10,
});
```

### Rollovers

```typescript
import { expectCustomerRolloverCorrect, expectNoRollovers } from "@tests/integration/billing/utils/rollover/expectCustomerRolloverCorrect";

expectCustomerRolloverCorrect({
  customer, featureId: TestFeature.Messages,
  expectedRollovers: [{ balance: 150 }], totalBalance: 550,
});
```

## Item & Product Fixtures — Quick Reference

### Items (`@tests/utils/fixtures/items`)

| Item | Feature | Default | Notes |
|------|---------|---------|-------|
| `items.dashboard()` | Dashboard | boolean | On/off access |
| `items.monthlyMessages({ includedUsage? })` | Messages | 100 | Resets monthly |
| `items.monthlyWords({ includedUsage? })` | Words | 100 | Resets monthly |
| `items.monthlyCredits({ includedUsage? })` | Credits | 100 | Resets monthly |
| `items.monthlyUsers({ includedUsage? })` | Users | 5 | Resets monthly |
| `items.unlimitedMessages()` | Messages | unlimited | No cap |
| `items.lifetimeMessages({ includedUsage? })` | Messages | 100 | Never resets (interval: null) |
| `items.prepaidMessages({ includedUsage?, billingUnits?, price? })` | Messages | 0, 100, $10 | Buy upfront in packs |
| `items.prepaid({ featureId, includedUsage?, billingUnits?, price? })` | any | 0, 100, $10 | Generic prepaid |
| `items.prepaidUsers({ includedUsage?, billingUnits? })` | Users | 0, 1 | Per-seat prepaid |
| `items.consumableMessages({ includedUsage? })` | Messages | 0 | $0.10/unit overage |
| `items.consumableWords({ includedUsage? })` | Words | 0 | $0.05/unit overage |
| `items.consumable({ featureId, includedUsage?, price?, billingUnits? })` | any | 0, $0.10, 1 | Generic consumable |
| `items.allocatedUsers({ includedUsage? })` | Users | 0 | $10/seat prorated |
| `items.allocatedWorkflows({ includedUsage? })` | Workflows | 0 | $10/workflow prorated |
| `items.freeAllocatedUsers({ includedUsage? })` | Users | 5 | Free seats (no price) |
| `items.oneOffMessages({ includedUsage?, billingUnits?, price? })` | Messages | 0, 100, $10 | One-time purchase |
| `items.monthlyPrice({ price? })` | - | $20 | Base price item |
| `items.annualPrice({ price? })` | - | $200 | Annual base price |
| `items.oneOffPrice({ price? })` | - | $50 | One-time base price |
| `items.monthlyMessagesWithRollover({ includedUsage?, rolloverConfig })` | Messages | 100 | With rollover |
| `items.tieredPrepaidMessages({ includedUsage?, billingUnits?, tiers? })` | Messages | - | Graduated tier prepaid |
| `items.tieredConsumableMessages({ includedUsage?, billingUnits?, tiers? })` | Messages | - | Graduated tier consumable |

### Products (`@tests/utils/fixtures/products`)

| Product | Built-in Base Price | Default ID |
|---------|-------------------|------------|
| `products.base({ items, id?, isDefault?, isAddOn? })` | **None** (free) | "base" |
| `products.pro({ items, id? })` | **$20/mo** | "pro" |
| `products.premium({ items, id? })` | **$50/mo** | "premium" |
| `products.growth({ items, id? })` | **$100/mo** | "growth" |
| `products.ultra({ items, id? })` | **$200/mo** | "ultra" |
| `products.proAnnual({ items, id? })` | **$200/yr** | "pro-annual" |
| `products.proWithTrial({ items, id?, trialDays?, cardRequired? })` | **$20/mo** + trial | "pro-trial" |
| `products.baseWithTrial({ items, id?, trialDays?, cardRequired? })` | **None** + trial | "base-trial" |
| `products.oneOff({ items, id? })` | **$10 one-time** | "one-off" |
| `products.recurringAddOn({ items, id? })` | **$20/mo** add-on | "addon" |
| `products.oneOffAddOn({ items, id? })` | **$10 one-time** add-on | "one-off-addon" |

**NEVER add `items.monthlyPrice()` to `products.pro()` — it already has $20/mo built in.**

## Common Test Patterns

### Attach Test (Upgrade)

```typescript
test.concurrent(`${chalk.yellowBright("upgrade: free to pro")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const free = products.base({ id: "free", items: [messagesItem] });
  const pro = products.pro({ items: [messagesItem] });

  const { customerId, autumnV1, ctx } = await initScenario({
    customerId: "upgrade-free-pro",
    setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [free, pro] })],
    actions: [s.billing.attach({ productId: free.id })],
  });

  await autumnV1.billing.attach({
    customer_id: customerId, product_id: pro.id, redirect_mode: "if_required",
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  await expectCustomerProducts({ customer, active: [pro.id], notPresent: [free.id] });
  expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });
  await expectStripeSubscriptionCorrect({ ctx, customerId });
});
```

### Downgrade Test (Scheduled)

```typescript
test.concurrent(`${chalk.yellowBright("downgrade: pro to free")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });
  const free = products.base({ id: "free", items: [messagesItem] });

  const { customerId, autumnV1, ctx } = await initScenario({
    customerId: "downgrade-pro-free",
    setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, free] })],
    actions: [s.billing.attach({ productId: pro.id })],
  });

  await autumnV1.billing.attach({
    customer_id: customerId, product_id: free.id, redirect_mode: "if_required",
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  await expectCustomerProducts({
    customer,
    canceling: [pro.id],   // NOT active — canceling means active + canceled_at set
    scheduled: [free.id],
  });
  await expectStripeSubscriptionCorrect({ ctx, customerId });
});
```

### Track Test (Decimal.js Required)

```typescript
import { Decimal } from "decimal.js";

test.concurrent(`${chalk.yellowBright("track: basic deduction")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const free = products.base({ items: [messagesItem] });

  const { customerId, autumnV1 } = await initScenario({
    customerId: "track-basic",
    setup: [s.customer({}), s.products({ list: [free] })],
    actions: [s.attach({ productId: free.id })],
  });

  await autumnV1.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 23.47 });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(
    new Decimal(100).sub(23.47).toNumber()
  );
});
```

### Prepaid Test

```typescript
test.concurrent(`${chalk.yellowBright("prepaid: attach with quantity")}`, async () => {
  const prepaidItem = items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 });
  const pro = products.base({ id: "prepaid-pro", items: [prepaidItem] });

  const { customerId, autumnV1, ctx } = await initScenario({
    customerId: "prepaid-attach",
    setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro] })],
    actions: [
      s.billing.attach({
        productId: pro.id,
        options: [{ feature_id: TestFeature.Messages, quantity: 200 }], // inclusive of includedUsage
      }),
    ],
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  // quantity 200 → rounded to nearest billingUnit (200), purchased_balance: 200
  expectCustomerFeatureCorrect({ customer, featureId: TestFeature.Messages, balance: 200 });
  await expectStripeSubscriptionCorrect({ ctx, customerId });
});
```

## Test Type Decision Tree

| Writing a... | Use in `initScenario` actions | Test body calls |
|---|---|---|
| **Billing attach test** | `s.billing.attach()` for setup | `autumnV1.billing.attach()` for action under test |
| **Multi-attach test** | `s.billing.attach()` for setup | `autumnV1.billing.multiAttach()` |
| **Update subscription test** | `s.attach()` for initial attach | `autumnV1.subscriptions.update()` |
| **Cancel test** | `s.billing.attach()` for setup | `autumnV1.subscriptions.update({ cancel: "end_of_cycle" })` |
| **Track/check test** | `s.attach()` for product setup | `autumnV1.track()` / `autumnV1.check()` |
| **Prepaid test** | `s.billing.attach({ options })` | `autumnV1.billing.attach()` or `subscriptions.update()` |
| **Entity test** | `s.entities()` in setup, `entityIndex` in actions | Entity-specific API calls |
| **Webhook test** | `s.customer({ skipWebhooks: true })` | Manual customer create with `skipWebhooks: false` |

## Balance Calculation Rules

| Feature Type | Balance Formula | Use Decimal.js? |
|---|---|---|
| Free metered | `includedUsage - usage` | Yes |
| Prepaid | `includedUsage + purchasedQuantity - usage` | Yes |
| Consumable + Prepaid same feature | `consumable.includedUsage + prepaid.purchasedQuantity - usage` | Yes |
| Allocated | `includedUsage + purchasedSeats - currentSeats` | Yes |
| Credit system | `creditBalance - sum(action * credit_cost)` | Yes, + `getCreditCost()` |

## Resetting Features: Free vs Paid

- **Free products** (no Stripe sub): Use `s.resetFeature({ featureId, productId })` — simulates cron job
- **Paid products** (has Stripe sub): Use `s.advanceToNextInvoice()` — advances test clock, triggers `invoice.paid` webhook

## Running Tests

**CRITICAL: NEVER run tests automatically. Always ask the user for permission before running any test command.** The user likely has a dev server running and needs to coordinate test execution.

### Commands (run from repo root)

```bash
# Run a single test file
bun test server/tests/integration/billing/attach/my-test.test.ts --timeout 60000

# Run a specific test by name pattern within a file
bun test server/tests/integration/billing/attach/my-test.test.ts -t "upgrade: free to pro" --timeout 60000

# Run all tests in a directory
bun test server/tests/integration/billing/attach/ --timeout 60000

# Using the package.json script (loads env via infisical)
bun run --cwd server test:integration server/tests/integration/billing/attach/my-test.test.ts
```

### Key Points

- **`--timeout 60000`** (or higher) is essential — billing tests involve Stripe test clocks and can take 30s+
- `bunfig.toml` sets `timeout = 0` (infinite) and preloads env + test setup automatically
- Run **one test file at a time** during development to avoid test clock conflicts
- All server-side `console.log` output goes to the **server's logs**, not the test output — ask the user to paste server logs if debugging

### After Writing Tests

Always run a typecheck:
```bash
bun ts
```
This runs `bunx tsgo --build --noEmit` in the server directory. Fix all type errors before considering the task done.

## References (Load On-Demand for Edge Cases)

- [references/SCENARIO.md](references/SCENARIO.md) — Full initScenario details, all builder params
- [references/FIXTURES.md](references/FIXTURES.md) — Complete item/product fixture params
- [references/ENTITIES.md](references/ENTITIES.md) — Entity-based testing (entity-products vs per-entity features)
- [references/EXPECTATIONS.md](references/EXPECTATIONS.md) — All expectation utility signatures
- [references/PRORATION.md](references/PRORATION.md) — Proration calculation utilities
- [references/GOTCHAS.md](references/GOTCHAS.md) — Expanded wrong/right examples for every common mistake
- [references/TRACK-CHECK.md](references/TRACK-CHECK.md) — Track/check endpoint testing, credit systems
- [references/WEBHOOKS.md](references/WEBHOOKS.md) — Outbound webhook testing with Svix Play
- [references/STRIPE-BEHAVIORS.md](references/STRIPE-BEHAVIORS.md) — Stripe webhook behaviors
