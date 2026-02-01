---
name: write-test
description: Write integration tests for the Autumn billing system. Use when creating tests, writing test scenarios for billing/subscription features, track/check endpoints, or when the user asks about testing, test cases, or QA.
license: Proprietary
metadata:
  author: autumn
  version: "1.0"
---

## What I do

Write integration tests for the Autumn billing system using the `initScenario` pattern.

## Before Writing Any Test

**ALWAYS check for duplicate test scenarios FIRST:**
1. Search the test directory for similar scenarios using `Grep` with relevant keywords (e.g., `new_billing_subscription`, `cancel.*addon`, feature names)
2. If a duplicate or very similar scenario exists, **WARN the user and ask for confirmation** before proceeding
3. Only proceed with writing the test after confirming it's not a duplicate

**ALWAYS read these codebase files FIRST:**
1. `server/tests/TEST_GUIDE.md` - Core patterns, fixtures, scenario builder
2. For billing tests: `server/tests/integration/billing/update-subscription/BILLING_GUIDE.md`

## Critical Rules

**DO:**
- **ALWAYS use `test.concurrent()` for ALL tests** - never use plain `test()`. This enables parallel execution.
- Use `initScenario` with `s.*` builders
- Use `product.id` in `s.attach()` (never string literals)
- Use `product.id` in expectations too (initScenario already prefixes with customerId)
- Use `Decimal.js` for balance calculations in track tests
- Unique `customerId` per test
- Use generic types with `AutumnInt`: `autumnV1.customers.get<ApiCustomerV3>()`, `autumnV1.check<CheckResponseV1>()`
- **USE UTILITY FUNCTIONS WHENEVER POSSIBLE** - the shorter the code, the better. Check `server/tests/integration/billing/utils/` for existing utilities like `expectCustomerProducts`, `expectProductScheduled`, `expectCustomerInvoiceCorrect`, etc.
- **Set up all prerequisite state in `initScenario` actions** - the test body should only call the single action being tested

**DON'T:**
- Use plain `test()` - **ALWAYS use `test.concurrent()`**
- Use `describe/beforeAll/test` (legacy pattern)
- Use `Date.now()` with test clocks (use `advancedTo`)
- Share state between tests
- Use raw arithmetic for balance calculations (floating point errors)
- Use `as unknown as Type` casting - use generic types instead
- Write manual assertion loops when a utility function exists
- Use `${product.id}_${customerId}` for productId - just use `product.id` (already prefixed)
- **Call multiple setup actions in the test body** - put prerequisite attaches/tracks in `initScenario` actions, test body should only call the action being tested

## AutumnInt Response Types

| Client | customers.get | entities.get | check |
|--------|---------------|--------------|-------|
| `autumnV1` | `ApiCustomerV3` | `ApiEntityV0` | `CheckResponseV1` |
| `autumnV2` | `ApiCustomer` | `ApiEntityV1` | `CheckResponseV2` |

## Minimal Template

```typescript
import { expect, test } from "bun:test";
import { type ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("feature: description")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.base({ id: "pro", items: [messagesItem] });

  const { customerId, autumnV1 } = await initScenario({
    customerId: "unique-test-id",
    setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro] })],
    actions: [s.attach({ productId: pro.id })],
  });

  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  expectCustomerFeatureCorrect({ customer, featureId: TestFeature.Messages, balance: 100 });
});
```

## Test Structure: Scenario vs Action

**Key principle:** Set up all prerequisite state in `initScenario`, test body only calls the action being tested.

```typescript
// ✅ GOOD - Testing "attach one-time after pro"
// Pre-existing pro product set up in initScenario actions
const { autumnV1 } = await initScenario({
  customerId,
  setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, oneOff] })],
  actions: [s.attach({ productId: pro.id })],  // Prerequisite state
});

// Test body only tests the ONE action we care about
const preview = await autumnV1.billing.previewAttach({ customer_id: customerId, product_id: oneOff.id });
await autumnV1.billing.attach({ customer_id: customerId, product_id: oneOff.id });
// ... verify results

// ❌ BAD - Multiple attaches in test body
const { autumnV1 } = await initScenario({
  customerId,
  setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, oneOff] })],
  actions: [],  // Empty!
});

await autumnV1.billing.attach({ customer_id: customerId, product_id: pro.id });  // Should be in initScenario
await autumnV1.billing.attach({ customer_id: customerId, product_id: oneOff.id });
```

## References

Load these on-demand for detailed information:

- [references/SCENARIO.md](references/SCENARIO.md) - Scenario initialization, product configs, `s.*` builders
- [references/FIXTURES.md](references/FIXTURES.md) - Item and product fixtures with all params
- [references/ENTITIES.md](references/ENTITIES.md) - Entity-based testing (multi-tenant, per-entity billing)
- [references/TRACK-CHECK.md](references/TRACK-CHECK.md) - Track/check endpoint testing, credit systems, Decimal.js
- [references/EXPECTATIONS.md](references/EXPECTATIONS.md) - All expectation utilities
- [references/GOTCHAS.md](references/GOTCHAS.md) - Common pitfalls, debugging, billing edge cases
- [references/WEBHOOKS.md](references/WEBHOOKS.md) - Outbound webhook testing with Svix Play
- [references/STRIPE-BEHAVIORS.md](references/STRIPE-BEHAVIORS.md) - Stripe webhook behaviors for consumables, trials, cancellations

## File Location

Tests: `server/tests/integration/billing/` organized by feature area.

## Run Tests

```bash
bun test path/to/file.test.ts
```
