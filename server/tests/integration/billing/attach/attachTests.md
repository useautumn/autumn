# Attach V2 Test Guide

## Key Gotchas

1. **Always use `product.id`, never string literals**
   ```typescript
   // ✅ GOOD
   s.attach({ productId: pro.id })
   
   // ❌ BAD
   s.attach({ productId: "pro" })
   ```

2. **Multiple products need unique IDs**
   - Without `isAddOn: true`, second product **replaces** the first
   ```typescript
   const prod1 = constructProduct({ type: "free", id: "prod1", items: [...] });
   const prod2 = constructProduct({ type: "free", id: "prod2", isAddOn: true, items: [...] });
   ```

3. **Payment method required for paid features**
   ```typescript
   s.customer({ paymentMethod: "success" })  // Required for overage, per-seat, usage-based, base price
   ```

4. **Wait 2000ms after `track` before `attach`**
   ```typescript
   await autumnV1.track({ ... });
   await new Promise(r => setTimeout(r, 2000));  // track syncs to Postgres async
   await autumnV1.attach({ ... });
   ```

5. **Prepaid items require `options` with `quantity` on attach**
   - The `quantity` represents actual units (e.g., 100 messages), NOT number of packs
   - If `billingUnits: 100` and you want 1 pack, pass `quantity: 100`
   ```typescript
   // Product has: billingUnits: 100, price: 10 (100 messages for $10)
   s.attach({ 
     productId: pro.id, 
     options: [{ feature_id: TestFeature.Messages, quantity: 100 }]  // 100 units = 1 pack = $10
   })
   ```

6. **Use `products.base()` for free products** (no base price)
   - `products.pro()` already includes $20/mo base price — don't add `monthlyPrice()`

7. **Lifetime interval: `null` vs `"one_off"`**
   - Constructing: use `null` → `constructFeatureItem({ interval: null })`
   - In API responses: use `ResetInterval.OneOff`

8. **Canceling/Downgrading is NOT a status**
   - Use `expectProductCanceling` helper, not `expect(product.status).toBe("canceling")`

9. **Server logs not visible in tests**
   - Console logs in server code don't appear in test output

10. **Always verify subscription state when billing is involved**
    - Anytime prices are involved (base price, prepaid, allocated, etc.), use `expectSubToBeCorrect` to verify subscription state
    ```typescript
    await expectSubToBeCorrect({
      db: ctx.db,
      customerId,
      org: ctx.org,
      env: ctx.env,
      entityId?: string,  // For entity-level subscription
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

13. **Product IDs in expectations - just use `product.id`**
    - `initScenario` already prefixes product IDs with `customerId`
    - Don't double-prefix in expectations
    ```typescript
    // ✅ GOOD - just use product.id
    expectProductActive({ customer, productId: pro.id });
    
    // ❌ BAD - double prefix
    expectProductActive({ customer, productId: `${pro.id}_${customerId}` });
    ```

14. **Always pass `redirect_mode: "if_required"` to attach calls**
    - Prevents checkout redirect when customer already has a payment method
    - Without this, the endpoint may redirect to Stripe Checkout even when payment method exists
    ```typescript
    await autumnV1.billing.attach({
      customer_id: customerId,
      product_id: pro.id,
      redirect_mode: "if_required",  // Always include this in tests
    });
    ```

16. **One-time products do NOT replace/expire other products**
    - Attaching a one-time product will NOT cancel or replace existing main products
    - One-time products are always treated as add-ons (they stack with existing products)
    - Only recurring products can replace other recurring products

17. **Set up scenario state in `initScenario`, test only the action being tested**
    - All prerequisite state (existing products, entities, usage) should be set up in `initScenario` actions
    - The test body should only call the single action being tested and verify results
    ```typescript
    // ✅ GOOD - scenario setup in initScenario, test only calls one attach
    const { autumnV1 } = await initScenario({
      customerId,
      setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro, oneOff] })],
      actions: [s.attach({ productId: pro.id })],  // Pre-existing state
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

18. **Scheduled-switch tests must advance test clock with `advanceToNextInvoice()`**
    - After scheduling a downgrade, advance the test clock to verify:
      - A. Next cycle invoice is correct
      - B. Products on customer are correct after cycle
    ```typescript
    // Schedule the downgrade
    await s.attach({ productId: basic.id });  // Schedules switch to basic at end of cycle
    
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
