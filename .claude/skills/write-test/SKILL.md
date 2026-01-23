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

**ALWAYS read these codebase files FIRST:**
1. `server/tests/TEST_GUIDE.md` - Core patterns, fixtures, scenario builder
2. For billing tests: `server/tests/integration/billing/update-subscription/BILLING_GUIDE.md`

## Critical Rules

**DO:**
- Use `test.concurrent()` for isolated, parallel tests
- Use `initScenario` with `s.*` builders
- Use `product.id` in `s.attach()` (never string literals)
- Use `Decimal.js` for balance calculations in track tests
- Unique `customerId` per test
- Use generic types with `AutumnInt`: `autumnV1.customers.get<ApiCustomerV3>()`, `autumnV1.check<CheckResponseV1>()`

**DON'T:**
- Use `describe/beforeAll/test` (legacy pattern)
- Use `Date.now()` with test clocks (use `advancedTo`)
- Share state between tests
- Use raw arithmetic for balance calculations (floating point errors)
- Use `as unknown as Type` casting - use generic types instead

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
