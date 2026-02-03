# Attach V2 Test Guide

> **IMPORTANT**: These tests are for the **NEW `billing.attach` endpoint** (V2 attach flow), NOT the legacy `attach` endpoint.
> 
> - In `initScenario` actions: use `s.billing.attach()` (NOT `s.attach()`)
> - In test body: use `autumnV1.billing.attach()` (NOT `autumnV1.attach()`)
>
> The legacy `s.attach()` and `autumnV1.attach()` exist for backwards compatibility but should NOT be used in these tests.

## Running Tests

Run a single test file:
```bash
bun test server/tests/integration/billing/attach/immediate-switch/immediate-switch-basic.test.ts
```

Run a specific test by name pattern:
```bash
bun test server/tests/integration/billing/attach/immediate-switch/immediate-switch-basic.test.ts -t "test 3"
```

Run with longer timeout (for slow tests):
```bash
bun test server/tests/integration/billing/attach/immediate-switch/immediate-switch-basic.test.ts --timeout 60000
```

**Note**: Only run one test at a time during development to avoid test clock conflicts.

---

## Key Gotchas

1. **Trial Invoice Count - Stripe creates $0 invoice on subscription creation**
   ```typescript
   // ❌ WRONG - Trial subscription DOES create an invoice
   await expectCustomerInvoiceCorrect({
     customer,
     count: 0,  // Wrong! Trial creates $0 invoice
   });
   
   // ✅ RIGHT - Trial subscription creates 1 invoice with $0 total
   await expectCustomerInvoiceCorrect({
     customer,
     count: 1,
     latestTotal: 0,
   });
   
   // ✅ RIGHT - Free product (no Stripe subscription) has no invoice
   await expectCustomerInvoiceCorrect({
     customer,
     count: 0,  // Correct for free products
   });
   ```
   Rules:
   - **Stripe subscription created (even trialing)**: `count: 1, latestTotal: 0`
   - **Subscription updated while trialing**: Invoice count increases by 1 (still `latestTotal: 0`)
   - **Free product (no Stripe subscription)**: `count: 0` is correct

2. **Always use `product.id`, never string literals**
   ```typescript
   // ✅ GOOD
   s.billing.attach({ productId: pro.id })
   
   // ❌ BAD
   s.billing.attach({ productId: "pro" })
   ```

3. **Multiple products need unique IDs**
   - Without `isAddOn: true`, second product **replaces** the first
   ```typescript
   const prod1 = constructProduct({ type: "free", id: "prod1", items: [...] });
   const prod2 = constructProduct({ type: "free", id: "prod2", isAddOn: true, items: [...] });
   ```

4. **Payment method required for paid features**
   ```typescript
   s.customer({ paymentMethod: "success" })  // Required for overage, per-seat, usage-based, base price
   ```

5. **Wait 2000ms after `track` before `attach`**
   ```typescript
   await autumnV1.track({ ... });
   await new Promise(r => setTimeout(r, 2000));  // track syncs to Postgres async
   await autumnV1.attach({ ... });
   ```

6. **Prepaid items require `options` with `quantity` on attach**
   - The `quantity` represents actual units (e.g., 100 messages), NOT number of packs
   - If `billingUnits: 100` and you want 1 pack, pass `quantity: 100`
   ```typescript
   // Product has: billingUnits: 100, price: 10 (100 messages for $10)
   s.billing.attach({ 
     productId: pro.id, 
     options: [{ feature_id: TestFeature.Messages, quantity: 100 }]  // 100 units = 1 pack = $10
   })
   ```

6b. **Prepaid `includedUsage` must be a multiple of `billingUnits` (or 0)**
   - When Stripe tiered pricing is created, `up_to` = `includedUsage / billingUnits`
   - Stripe requires `up_to` to be a positive integer or "inf"
   - If this results in a decimal (e.g., 50/100=0.5), Stripe rejects it
   ```typescript
   // ❌ BAD - 50 / 100 = 0.5, invalid for Stripe
   constructPrepaidItem({
     featureId: TestFeature.Messages,
     includedUsage: 50,
     billingUnits: 100,
   });
   
   // ✅ GOOD - multiples of billingUnits
   constructPrepaidItem({
     featureId: TestFeature.Messages,
     includedUsage: 0,   // or 100, 200, 300, etc.
     billingUnits: 100,
   });
   ```

7. **Use `products.base()` for free products** (no base price)
   - `products.pro()` already includes $20/mo base price — don't add `monthlyPrice()`

8. **Lifetime interval: `null` vs `"one_off"`**
   - Constructing: use `null` → `constructFeatureItem({ interval: null })`
   - In API responses: use `ResetInterval.OneOff`

9. **Canceling/Downgrading is NOT a status**
   - Use `expectProductCanceling` helper, not `expect(product.status).toBe("canceling")`

10. **Server logs not visible in tests**
    - Console logs in server code don't appear in test output

11. **ALWAYS verify Stripe subscription state after billing calls**
    - After EVERY `billing.attach()` call, verify the Stripe subscription state matches Autumn
    - For paid products: use `expectSubToBeCorrect`
    - For free products (no Stripe subscription): use `expectNoStripeSubscription`
    ```typescript
    // For paid products (has base price, prepaid, allocated, etc.)
    await expectSubToBeCorrect({
      db: ctx.db,
      customerId,
      org: ctx.org,
      env: ctx.env,
      entityId?: string,  // For entity-level subscription
    });
    
    // For free products OR after downgrading to free
    import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
    await expectNoStripeSubscription({
      db: ctx.db,
      customerId,
      org: ctx.org,
      env: ctx.env,
    });
    ```

11. **ALWAYS call `billing.previewAttach` before `billing.attach` and verify**
    - Call preview BEFORE every attach to verify pricing
    - Assert `preview.total` matches expected amount EXACTLY (not `toBeCloseTo`)
    - After attach, verify invoice total matches preview total
    ```typescript
    // 1. Preview first - verify expected charge
    const preview = await autumnV1.billing.previewAttach({
      customer_id: customerId,
      product_id: pro.id,
      entity_id: entityId,  // Optional for entity-level
      options: [{ feature_id: TestFeature.Messages, quantity: 100 }],  // If prepaid (units, not packs)
    });
    expect(preview.total).toBe(30);  // EXACT match, not toBeCloseTo
    
    // 2. Attach
    await autumnV1.billing.attach({ ... });
    
    // 3. Verify invoice matches preview
    const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
    expectCustomerInvoiceCorrect({
      customer,
      count: 1,
      latestTotal: 30,  // Must match preview.total
    });
    ```

12. **Add-on is defined at product level, NOT in attach params**
    - Use `products.recurringAddOn()` or `products.base({ isAddOn: true })` when creating the product
    - Do NOT pass `is_add_on` to the attach endpoint
    ```typescript
    // ✅ GOOD - define add-on at product creation
    const addon = products.recurringAddOn({ id: "addon", items: [...] });
    // or
    const addon = products.base({ id: "addon", items: [...], isAddOn: true });
    
    s.billing.attach({ productId: addon.id });
    
    // ❌ BAD - is_add_on is not an attach param
    s.billing.attach({ productId: pro.id, isAddOn: true });
    ```

13. **Use `s.billing.attach()` and `autumnV1.billing.attach()` - NOT the legacy attach**
    - These tests are for the NEW billing.attach endpoint (V2 attach flow)
    - Never use `s.attach()` or `autumnV1.attach()` in these test files
    ```typescript
    // ✅ GOOD - new billing.attach endpoint
    s.billing.attach({ productId: pro.id })
    await autumnV1.billing.attach({ customer_id: customerId, product_id: pro.id })
    
    // ❌ BAD - legacy attach endpoint
    s.attach({ productId: pro.id })
    await autumnV1.attach({ customer_id: customerId, product_id: pro.id })
    ```

14. **For scheduled switches (downgrades), always call previewAttach first with exact `startsAt` verification**
    - Preview should return `total: 0` since the change is scheduled, not immediate
    - Use `expectPreviewNextCycleCorrect` to verify `next_cycle.starts_at` and `next_cycle.total`
    - Pass the EXACT `startsAt` using `addMonths(advancedTo, 1).getTime()` - do NOT use approximates
    ```typescript
    import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
    import { addMonths } from "date-fns";
    
    const { autumnV1, ctx, advancedTo } = await initScenario({
      customerId,
      setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, basic] })],
      actions: [s.billing.attach({ productId: pro.id })],  // Initial product only
    });
    
    // Preview the downgrade - verify total and next_cycle
    const preview = await autumnV1.billing.previewAttach({
      customer_id: customerId,
      product_id: basic.id,  // lower tier product
      entity_id: entityId,   // if entity-level
    });
    expect(preview.total).toBe(0);  // Scheduled changes have no immediate charge
    expectPreviewNextCycleCorrect({
      preview,
      total: 10,  // basic product's price
      startsAt: addMonths(advancedTo, 1).getTime(),  // EXACT timestamp, not approximate
    });
    
    // Then perform the attach
    await autumnV1.billing.attach({
      customer_id: customerId,
      product_id: basic.id,
      redirect_mode: "if_required",
    });
    ```

15. **Do NOT create a new initScenario to advance the test clock**
    - WRONG: Creating a second `initScenario` with the same customerId to advance time
    - RIGHT: Keep downgrade attach OUT of initScenario, call it in test body, then use helpers to advance
    ```typescript
    // ❌ WRONG - Do NOT do this
    const { autumnV1 } = await initScenario({
      customerId,
      actions: [s.billing.attach({ productId: pro.id })],
    });
    // ... do preview and attach ...
    const { autumnV1: autumnV1After } = await initScenario({
      customerId,
      actions: [
        s.billing.attach({ productId: pro.id }),
        s.billing.attach({ productId: basic.id }),
        s.advanceToNextInvoice(),
      ],
    });
    
    // ✅ RIGHT - Move downgrade out and use same scenario
    const { autumnV1, ctx, advancedTo } = await initScenario({
      customerId,
      actions: [s.billing.attach({ productId: pro.id })],  // Only initial product
    });
    
    // Preview and attach in test body
    const preview = await autumnV1.billing.previewAttach({ ... });
    await autumnV1.billing.attach({ ... });
    
    // For tests that need end-of-cycle verification, either:
    // A. Split into separate test, OR
    // B. Use advanceTestClock helper from the same ctx
    ```

16. **Prepaid next_cycle.total depends on quantity passed at attach time**
    - If `options: [{ quantity: 100 }]` passed → `next_cycle.total` = price for 100 units
    - If no options passed → inherits current product's quantity (if any), else 0
    ```typescript
    // With explicit quantity
    const preview = await autumnV1.billing.previewAttach({
      customer_id: customerId,
      product_id: newPrepaidProduct.id,
      options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
    });
    // next_cycle.total = price for 100 units (e.g., $10 if price is $10/100 units)
    
    // Without options - inherits from current product
    const preview = await autumnV1.billing.previewAttach({
      customer_id: customerId,
      product_id: newPrepaidProduct.id,
      // no options - uses current product's quantity
    });
    ```

17. **Product IDs in expectations - just use `product.id`**
    - `initScenario` already prefixes product IDs with `customerId`
    - Don't double-prefix in expectations
    ```typescript
    // ✅ GOOD - just use product.id
    expectProductActive({ customer, productId: pro.id });
    
    // ❌ BAD - double prefix
    expectProductActive({ customer, productId: `${pro.id}_${customerId}` });
    ```

18. **Use `expectCustomerProducts` batch helper when checking multiple products**
    - When verifying 2+ product states, use the batch helper instead of individual calls
    - More concise and easier to read
    ```typescript
    // ✅ GOOD - batch check
    await expectCustomerProducts({
      customer,
      active: [premium.id],
      notPresent: [pro.id, free.id],
    });
    
    // ❌ BAD - multiple individual calls
    await expectProductActive({ customer, productId: premium.id });
    await expectProductNotPresent({ customer, productId: pro.id });
    await expectProductNotPresent({ customer, productId: free.id });
    ```

19. **Always pass `redirect_mode: "if_required"` to attach calls**
    - Prevents checkout redirect when customer already has a payment method
    - Without this, the endpoint may redirect to Stripe Checkout even when payment method exists
    ```typescript
    await autumnV1.billing.attach({
      customer_id: customerId,
      product_id: pro.id,
      redirect_mode: "if_required",  // Always include this in tests
    });
    ```

20. **One-time products do NOT replace/expire other products**
    - Attaching a one-time product will NOT cancel or replace existing main products
    - One-time products are always treated as add-ons (they stack with existing products)
    - Only recurring products can replace other recurring products

21. **Set up scenario state in `initScenario`, test only the action being tested**
    - All prerequisite state (existing products, entities, usage) should be set up in `initScenario` actions
    - The test body should only call the single action being tested and verify results
    ```typescript
    // ✅ GOOD - scenario setup in initScenario, test only calls one attach
    const { autumnV1 } = await initScenario({
      customerId,
      setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, oneOff] })],
      actions: [s.billing.attach({ productId: pro.id })],  // Pre-existing state
    });
    
    // Test body only calls the action being tested
    await autumnV1.billing.attach({ customer_id: customerId, product_id: oneOff.id });
    
    // ❌ BAD - attaching multiple products in test body
    const { autumnV1 } = await initScenario({
      customerId,
      setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, oneOff] })],
      actions: [],
    });
    
    await autumnV1.billing.attach({ customer_id: customerId, product_id: pro.id });  // Should be in initScenario
    await autumnV1.billing.attach({ customer_id: customerId, product_id: oneOff.id });
    ```

22. **Scheduled-switch tests must advance test clock with `advanceToNextInvoice()`**
    - After scheduling a downgrade, advance the test clock to verify:
      - A. Next cycle invoice is correct
      - B. Products on customer are correct after cycle
    ```typescript
    // Schedule the downgrade
    await s.billing.attach({ productId: basic.id });  // Schedules switch to basic at end of cycle
    
    // Advance to next billing cycle
    await advanceToNextInvoice({
      stripeCli: ctx.stripeCli,
      testClockId: ctx.testClockId,
      currentEpochMs,  // Use return value for consecutive advances
    });
    
    // Verify invoice and customer state
    const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
    expect(customer.products[0].id).toBe(basic.id);
    ```

---

## AutumnInt Generic Types

Always use generic type parameters for proper type safety:

- `autumnV1.customers.get<ApiCustomerV3>()`
- `autumnV1.entities.get<ApiEntityV0>()`
- `autumnV2.customers.get<ApiCustomer>()`
- `autumnV2.entities.get<ApiEntityV1>()`

---

## Folder Structure

| Folder | Description |
|--------|-------------|
| `new-plan/` | Attach when customer has no existing product |
| `immediate-switch/` | Upgrades (immediate) |
| `scheduled-switch/` | Downgrades (scheduled for end of cycle) |
| `checkout/` | Payment collection flows |
| `add-ons/` | Supplementary products |
| `trials/` | Free trial logic |
| `carry-over-usage/` | (TBD) |
| `groups/` | (TBD) |
| `errors/` | Validation and payment errors |
| `misc/` | Edge cases |

---

## Test File Guides

### Planned (Ready for Implementation)
- [new-plan.md](./new-plan.md) — Tests for attaching products when customer has no existing product (20 tests)
- [immediate-switch.md](./immediate-switch.md) — Tests for upgrades/immediate effect (34 tests)
- [scheduled-switch.md](./scheduled-switch.md) — Tests for downgrades/scheduled for end of cycle (32 tests)
- [checkout.md](./checkout.md) — Payment collection flows (13 tests in stripe-checkout, more TBD)
- [add-ons.md](./add-ons.md) — Supplementary products (25 tests)
- [trials.md](./trials.md) — Free trial logic (27 tests)
- [errors.md](./errors.md) — Validation and payment errors (33 tests)

### Needs Planning
- [future-plans.md](./future-plans.md) — Planning prompts for remaining folders:
  - `carry-existing-usages/` — Usage carryover on upgrade/downgrade
  - `invoice/` — `invoice: true` mode
  - `new-billing-subscription/` — Force new Stripe subscription
  - `billing-behavior/` — Proration control
  - `plan-schedule/` — Override upgrade/downgrade timing

---

## Proration Utilities

When testing mid-cycle upgrades/downgrades, use the proration utilities to calculate exact expected amounts.

**Location:** `@tests/integration/billing/utils/proration/`

### Import

```typescript
import { 
  getBillingPeriod, 
  calculateProration, 
  calculateProratedDiff 
} from "@tests/integration/billing/utils/proration";
```

### `calculateProratedDiff` (Most Common)

Calculate net charge for upgrade/downgrade. Works for base prices, prepaid, and allocated features.

```typescript
const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);

// Calculate prorated difference for base price upgrade
const expectedCharge = calculateProratedDiff({
  customer: customerBefore,
  advancedTo,                // From initScenario
  oldAmount: 20,             // Pro base price
  newAmount: 50,             // Premium base price
});

expect(preview.total).toBeCloseTo(expectedCharge, 0);
```

### Options for Multi-Product/Multi-Interval/Entity

```typescript
// Filter by product ID
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  productId: "pro",          // Optional: specific product
});

// Filter by billing interval (for dual subscriptions)
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  interval: "month",         // "month" | "year"
});

// Entity-level product
calculateProratedDiff({
  customer,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
  entityId: "ent-1",         // Or use entityIndex: 0
});
```

### Mixed Prorated + Non-Prorated (Consumable Arrear)

Consumable/arrear charges are **NEVER prorated** - add them separately:

```typescript
// Base price is prorated
const proratedBase = calculateProratedDiff({
  customer: customerBefore,
  advancedTo,
  oldAmount: 20,
  newAmount: 50,
});

// Consumable arrear is NOT prorated - full amount
const arrearOverage = 5; // 100 overage × $0.05

const expectedTotal = proratedBase + arrearOverage;
expect(preview.total).toBeCloseTo(expectedTotal, 0);
```

### Key Behaviors

| Feature Type | Prorated on Upgrade? |
|--------------|---------------------|
| Base price | ✅ Yes |
| Prepaid | ✅ Yes |
| Allocated | ✅ Yes |
| Consumable (arrear) | ❌ No - full amount |

### `getBillingPeriod`

Get the raw billing period from customer's subscription (for custom calculations):

```typescript
const period = getBillingPeriod({ customer });
// Returns: { start: number, end: number } in milliseconds
```

### `calculateProration`

Calculate prorated amount for a single price (not the difference):

```typescript
const proratedCharge = calculateProration({
  customer,
  advancedTo,
  amount: 50,  // Full price
});
// Returns prorated amount for remaining period
```

---

## Test Count Summary

| Category | Tests |
|----------|-------|
| new-plan | 20 |
| immediate-switch | 34 |
| scheduled-switch | 32 |
| checkout (stripe-checkout) | 13 |
| checkout (mode-decision) | TBD |
| checkout (autumn-checkout) | TBD |
| add-ons | 25 |
| trials | 27 |
| errors | 33 |
| **Total** | **184+** |
