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
   ```typescript
   s.attach({ 
     productId: pro.id, 
     options: [{ feature_id: TestFeature.Messages, quantity: 200 }] 
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

11. **Always call attach preview before attach to verify `preview.total`**
    - The preview endpoint validates pricing before the actual attach
    ```typescript
    const preview = await autumn.attachPreview({
      customer_id: customerId,
      product_id: productId,
      entity_id: entityId,  // Optional for entity-level
    });
    expect(preview.total).toBe(expectedTotal);
    
    // Then perform the actual attach
    await autumn.attach({ ... });
    ```

12. **Scheduled-switch tests must advance test clock with `advanceToNextInvoice()`**
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
