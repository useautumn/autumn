# Test Gotchas

Quick reference for common mistakes. Each gotcha follows the format:
- **Wrong** / **Right** examples
- Brief explanation if needed

---

## Setup & Initialization

### Payment Method Required for Paid Features
```typescript
// WRONG
s.customer({})

// RIGHT
s.customer({ paymentMethod: "success" })
```
Required for: overage pricing, per-seat, usage-based billing, any base price.

### Product IDs - Use Variables, Not Strings
```typescript
// WRONG
s.attach({ productId: "pro" })

// RIGHT
s.attach({ productId: pro.id })
```
Products are prefixed by `initScenario`. Always use `product.id`.

### Product IDs in Expectations - Just Use `product.id`
```typescript
// WRONG - Double prefix (initScenario already adds customerId prefix)
expectProductActive({
  customer,
  productId: `${pro.id}_${customerId}`,  // Will fail!
});

// RIGHT - Just use product.id directly
expectProductActive({
  customer,
  productId: pro.id,
});
```
`initScenario` already prefixes product IDs with `customerId`. When verifying products, just use `product.id` directly.

### Multiple Products Need Unique IDs
```typescript
// WRONG - Same default ID
const prod1 = constructProduct({ type: "free", items: [...] });
const prod2 = constructProduct({ type: "free", items: [...] });

// RIGHT
const prod1 = constructProduct({ type: "free", id: "prod1", items: [...] });
const prod2 = constructProduct({ type: "free", id: "prod2", isAddOn: true, items: [...] });
```
Without `isAddOn: true`, second product **replaces** the first.

### Product Fixtures with Built-in Base Price
`products.pro`, `products.proWithTrial`, etc. already include a base price. Only `products.base` has no base price.
```typescript
// WRONG - Double base price (pro already has $20/mo)
const priceItem = items.monthlyPrice({ price: 20 });
const pro = products.pro({
  id: "pro",
  items: [messagesItem, priceItem],  // Now has TWO base prices!
});

// RIGHT - Use products.base when you need a reference to the price item
const priceItem = items.monthlyPrice({ price: 20 });
const pro = products.base({
  id: "pro",
  items: [messagesItem, priceItem],
});
// Now priceItem.price! can be used in assertions

// ALSO RIGHT - Use pro/proWithTrial if you don't need the price reference
const pro = products.pro({ id: "pro", items: [messagesItem] });
const proTrial = products.proWithTrial({ id: "pro", items: [messagesItem], trialDays: 14 });
```

---

## API & Types

### Error Testing - Use `expectAutumnError`
```typescript
// WRONG
try { await autumn.customers.get("invalid"); } catch { errorThrown = true; }

// RIGHT
await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: () => autumn.customers.get("invalid"),
});
```

### Entities Use `customer:` Not `entity:`
```typescript
// WRONG
expectCustomerFeatureCorrect({ entity: entityData, ... });

// RIGHT
expectCustomerFeatureCorrect({ customer: entityData, ... });
```
`expectCustomerFeatureCorrect` accepts both `ApiCustomerV3` and `ApiEntityV0` via the `customer` param.

### Lifetime Interval: `null` vs `"one_off"`
```typescript
// Constructing: use null
constructFeatureItem({ interval: null });

// In API responses: use ResetInterval.OneOff
breakdown.find(b => b.reset?.interval === ResetInterval.OneOff);
// NOT: b.reset?.interval === null (won't match!)
```

---

## Timing & Sync

### Test Clock: `Date.now()` Doesn't Change
```typescript
// WRONG
expect(trialEndsAt).toBeCloseTo(Date.now() + ms.days(14));

// RIGHT
expect(trialEndsAt).toBeCloseTo(advancedTo + ms.days(14));
```

### Wait After Track Before Attach
```typescript
// WRONG - Cache gets stale data
await autumnV1.track({ ... });
await autumnV1.attach({ ... });

// RIGHT
await autumnV1.track({ ... });
await new Promise(r => setTimeout(r, 2000));
await autumnV1.attach({ ... });
```
`track` syncs to Postgres async; `attach` rebuilds from Postgres.

### Cache vs Database
```typescript
const cached = await autumnV1.customers.get(customerId);
await new Promise(r => setTimeout(r, 2000));
const fromDb = await autumnV1.customers.get(customerId, { skip_cache: "true" });
```

---

## Prepaid Features

### includedUsage Must Be Multiple of billingUnits
```typescript
// WRONG - 50 / 100 = 0.5, invalid for Stripe tiers
const invalidItem = constructPrepaidItem({
  featureId: TestFeature.Messages,
  includedUsage: 50,  // NOT a multiple of billingUnits!
  billingUnits: 100,
  price: 10,
});

// RIGHT - 0, 100, 200, etc. are valid
const validItem = constructPrepaidItem({
  featureId: TestFeature.Messages,
  includedUsage: 200,  // 200 / 100 = 2, valid integer
  billingUnits: 100,
  price: 10,
});
```
When Stripe tiered pricing is created, `up_to` for the first tier = `includedUsage / billingUnits`. Stripe requires `up_to` to be a positive integer or "inf". If this results in a decimal (e.g., 50/100=0.5), Stripe rejects it with: `Invalid tiers[0][up_to]: must be one of inf`.

### Quantity Required on Attach
```typescript
// WRONG
s.attach({ productId: pro.id })

// RIGHT
s.attach({ productId: pro.id, options: [{ feature_id: TestFeature.Messages, quantity: 200 }] })
```

### Quantity Rounds UP to Billing Units
```typescript
// billingUnits: 100
// quantity: 50  → 100 credits
// quantity: 150 → 200 credits
```

### Quantity Goes to `purchased_balance`
```typescript
// includedUsage: 0, billingUnits: 100, quantity: 50
// granted_balance: 0, purchased_balance: 100, current_balance: 100
```

### Consumable + Prepaid on Same Feature: Balances Sum
When a product has both consumable and prepaid items for the same feature, they create **separate breakdown entries** that sum together:
```typescript
// consumableItem with includedUsage: 50
// prepaidItem with quantity: 100
// Results in TWO breakdown entries for the same feature:
//   - Consumable: granted_balance: 50, purchased_balance: 0
//   - Prepaid:    granted_balance: 0,  purchased_balance: 100
// Aggregated totals:
//   - granted_balance: 50
//   - purchased_balance: 100  
//   - current_balance: 150 (sum of both)
//   - included_usage: 150 (NOT just prepaid quantity!)

// WRONG
expectCustomerFeatureCorrect({
  customer: entity,
  featureId: TestFeature.Messages,
  includedUsage: 100,  // Only prepaid quantity
  balance: 100,
});

// RIGHT
expectCustomerFeatureCorrect({
  customer: entity,
  featureId: TestFeature.Messages,
  includedUsage: 150,  // 50 (consumable) + 100 (prepaid)
  balance: 150,
});
```

---

## Billing & Invoices

### Consumable Overage: Not Charged on Update
```typescript
expect(preview.total).toBe(0);  // Even with existing overage
```
Overage billed at cycle end, not on subscription update.

### Allocated Features: Invoice on Track
```typescript
// 3 included seats, track 5 → 2 overage
// Invoice count = attach (1) + overage (1) = 2
```

### Prepaid Charge = Diff, Not Total
```typescript
// Old: 2 packs @ $10 = $20
// New: 5 packs @ $10 = $50
// preview.total = $30 (NOT $50)
```

### Free-to-Free: Skip Subscription Check
```typescript
// Free products have no Stripe subscription
expectCustomerFeatureCorrect({ ... });
// Don't call expectSubToBeCorrect
```

---

## Product States

### Canceling/Downgrading is NOT a Status
```typescript
// WRONG - Checking status for canceling products
expect(product.status).toBe("canceling");  // "canceling" is not a valid status!

// RIGHT - Use expectProductCanceling helper
await expectProductCanceling({ customer, productId: premium.id });
```
A product that is canceling or downgrading has `status: "active"` with `canceled_at` set. The "canceling" state is a derived state, not a status value.

### After Downgrade (A → B)
- **Product A**: "canceling" (`status: "active"`, `canceled_at` set) → use `expectProductCanceling`
- **Product B**: "scheduled" (`status: "scheduled"`) → use `expectProductScheduled`

After billing cycle:
- **Product A**: removed
- **Product B**: "active"

### expectProductCanceling Works with Entities
```typescript
// For entities, pass the entity data to the customer param
const entity1Data = await autumnV1.entities.get(customerId, entities[0].id);
await expectProductCanceling({
  customer: entity1Data,
  productId: premium.id,
});
```

---

## Misc

### Server Logs Not Visible in Tests
Console logs in server code don't appear in test output. Check server logs directly.

### Decimal.js for Balance Math
```typescript
// WRONG
expect(balance).toBe(100 - 23.47);

// RIGHT
expect(balance).toBe(new Decimal(100).sub(23.47).toNumber());
```

---

## Preview & Next Cycle

### Use `expectPreviewNextCycleCorrect` with Exact `startsAt`
```typescript
// WRONG - Approximate timing
expectPreviewNextCycleCorrect({
  preview,
  total: 20,
  startsAt: Date.now() + ms.months(1),  // Wrong base time!
});

// RIGHT - Use advancedTo from initScenario + addMonths
const { advancedTo } = await initScenario({ ... });
expectPreviewNextCycleCorrect({
  preview,
  total: 20,
  startsAt: addMonths(advancedTo, 1).getTime(),  // Exact next cycle start
});
```
`advancedTo` is the test clock time after initScenario completes. Use `addMonths(advancedTo, 1)` for next month's cycle start.

### Do NOT Create New `initScenario` to Advance Test Clock
```typescript
// WRONG - Creating new initScenario loses test context
const { autumnV1 } = await initScenario({ customerId, ... });
// ... do some tests ...
const { autumnV1: autumnV1After } = await initScenario({
  customerId,
  actions: [s.billing.attach(...), s.advanceToNextInvoice()],  // BAD!
});

// RIGHT - Use helpers on existing ctx, or include all actions in single initScenario
const { autumnV1, ctx } = await initScenario({
  customerId,
  setup: [...],
  actions: [
    s.billing.attach({ productId: pro.id }),
    s.billing.attach({ productId: free.id }),  // Schedule downgrade
    s.advanceToNextInvoice(),
  ],
});
```
Creating a new `initScenario` with the same `customerId` may cause issues because it tries to recreate the customer/products.

### Prepaid `next_cycle.total` Depends on Quantity
```typescript
// If prepaid billingUnits: 100, price: 10, quantity: 200
// next_cycle.total = (200 / 100) * 10 = $20

// WRONG - Assuming fixed price
expectPreviewNextCycleCorrect({ preview, total: 10 });

// RIGHT - Calculate based on quantity
const expectedTotal = (quantity / billingUnits) * price;
expectPreviewNextCycleCorrect({ preview, total: expectedTotal });
```
For prepaid features, `next_cycle.total` reflects the price for the quantity that will be purchased.

---

## Quick Reference

| Context | Import |
|---------|--------|
| Test context | `import ctx from "@tests/utils/testInitUtils/createTestContext.js"` |
| Error testing | `import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js"` |
| Error codes | `import { ErrCode } from "@autumn/shared"` |
| Reset intervals | `import { ResetInterval } from "@autumn/shared"` |
| Decimal math | `import { Decimal } from "decimal.js"` |
