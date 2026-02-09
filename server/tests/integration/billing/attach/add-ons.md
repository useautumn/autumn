# Add-Ons Test Plan

Tests for supplementary products attached alongside base products.

---

## File Structure

| File | Test Count | Description |
|------|------------|-------------|
| `addons-basic.test.ts` | 6 | Basic add-on attachment and behavior |
| `addons-cancel.test.ts` | 6 | Canceling add-ons (immediately, end-of-cycle) |
| `addons-upgrade.test.ts` | 4 | Upgrading/changing add-on products |
| `addons-entities.test.ts` | 5 | Entity-scoped add-ons |
| `addons-discounts.test.ts` | 4 | Discounts applied to add-ons |

**Total: 25 tests**

---

## Critical Rule

**Without `isAddOn: true`, second product REPLACES the first:**

```typescript
// ❌ BAD - Second attach replaces first product
const prod1 = constructProduct({ type: "pro", id: "prod1", items: [...] });
const prod2 = constructProduct({ type: "pro", id: "prod2", items: [...] });

// ✅ GOOD - Second product is an add-on
const prod1 = constructProduct({ type: "pro", id: "prod1", items: [...] });
const prod2 = constructProduct({ type: "pro", id: "prod2", isAddOn: true, items: [...] });
```

---

## Test Details

### `addons-basic.test.ts` (6 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | addon: attach free add-on | Pro product + free add-on | Both products exist, features combined |
| 2 | addon: attach paid add-on | Pro product + paid add-on ($20/mo) | Both products active, subscription has both items |
| 3 | addon: attach prepaid add-on | Base product + prepaid credits add-on | Credits added, both products on customer |
| 4 | addon: attach one-time add-on | Pro product + one-off credits | One-off not recurring, credits granted |
| 5 | addon: attach multiple add-ons | Pro + addon1 + addon2 | 3 products on customer |
| 6 | addon: replace add-on with new version | Attach addon v1, then addon v2 (same ID) | Only v2 on customer |

**Setup:**
```typescript
const pro = products.pro({ id: "pro", items: [messagesItem] });
const addon = products.base({
  id: "addon",
  isAddOn: true,
  items: [items.monthlyCredits({ includedUsage: 50 })],
});

const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [pro, addon] }),
  ],
  actions: [
    s.attach({ productId: pro.id }),
    s.attach({ productId: addon.id }),
  ],
});

const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expect(customer.products.length).toBe(2);
expectProductAttached({ customer, product: pro });
expectProductAttached({ customer, product: addon });
```

---

### `addons-cancel.test.ts` (6 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | cancel-addon: immediately - basic | Cancel add-on immediately | Add-on removed, base product remains |
| 2 | cancel-addon: immediately - with refund | Cancel paid add-on mid-cycle | Refund invoice created for unused time |
| 3 | cancel-addon: end-of-cycle | Schedule add-on cancellation | Add-on canceling, removed after cycle |
| 4 | cancel-addon: main product remains | Cancel add-on, verify base unaffected | Base product unchanged |
| 5 | cancel-addon: cancel both | Cancel main + add-on | Both products removed |
| 6 | cancel-addon: uncancel add-on | Cancel then uncancel add-on | Add-on restored |

**Cancel Pattern:**
```typescript
// Cancel add-on immediately
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: addon.id,
  cancel_action: "cancel_immediately",
});

// Verify
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductNotPresent({ customer, productId: addon.id });
expectProductActive({ customer, productId: pro.id }); // Base still active

// End-of-cycle cancel
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: addon.id,
  cancel_action: "cancel_end_of_cycle",
});

expectProductCanceling({ customer, productId: addon.id });
```

---

### `addons-upgrade.test.ts` (4 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | upgrade-addon: free to paid | Free add-on → paid add-on | Payment charged, add-on upgraded |
| 2 | upgrade-addon: paid to paid | $10 add-on → $20 add-on | Proration applied |
| 3 | upgrade-addon: update quantity | Prepaid add-on quantity change | New quantity reflected |
| 4 | upgrade-addon: main upgrade preserves addon | Pro → Premium (main upgrade) | Add-on still attached |

**Upgrade Pattern:**
```typescript
const addonBasic = products.base({
  id: "addon-basic",
  isAddOn: true,
  items: [items.monthlyPrice({ unitAmount: 10_00 })],
});

const addonPremium = products.base({
  id: "addon-premium",
  isAddOn: true,
  items: [items.monthlyPrice({ unitAmount: 20_00 })],
});

// Upgrade add-on
await autumnV1.attach({
  customer_id: customerId,
  product_id: addonPremium.id,
});

// Verify only new addon
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductAttached({ customer, product: addonPremium });
expectProductNotPresent({ customer, productId: addonBasic.id });
```

---

### `addons-entities.test.ts` (5 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | entity-addon: different entities different addons | Entity1 has addon A, Entity2 has addon B | Each entity has own add-on |
| 2 | entity-addon: shared addon across entities | Same add-on on multiple entities | Each entity charged separately |
| 3 | entity-addon: update addon on one entity | Change add-on quantity on Entity1 | Entity2 unchanged |
| 4 | entity-addon: cancel addon on one entity | Cancel add-on on Entity1 | Entity2 still has add-on |
| 5 | entity-addon: entity inherits customer addon | Customer-level add-on | All entities have access |

**Entity Pattern:**
```typescript
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [pro, addon] }),
    s.entities({ ids: ["entity-1", "entity-2"] }),
  ],
  actions: [
    s.attach({ productId: pro.id, entityId: "entity-1" }),
    s.attach({ productId: addon.id, entityId: "entity-1" }),
    s.attach({ productId: pro.id, entityId: "entity-2" }),
    // Entity-2 does NOT have add-on
  ],
});

// Verify entity-1 has both products
const entity1 = await autumnV1.entities.get<ApiEntityV0>(customerId, "entity-1");
expect(entity1.products.length).toBe(2);

// Verify entity-2 only has pro
const entity2 = await autumnV1.entities.get<ApiEntityV0>(customerId, "entity-2");
expect(entity2.products.length).toBe(1);
```

---

### `addons-discounts.test.ts` (4 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | addon-discount: discount on add-on | 20% discount on add-on only | Add-on price reduced, main unchanged |
| 2 | addon-discount: customer discount applies | Customer has 10% discount | Applies to both main + add-on |
| 3 | addon-discount: separate subscription own discount | Add-on on separate subscription | Own discount scope |
| 4 | addon-discount: main discount doesn't affect isolated addon | Main product discount | Isolated add-on not affected |

**Discount Pattern:**
```typescript
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [pro, addon] }),
    s.reward({ discountPercent: 20 }), // Customer-level discount
  ],
  actions: [
    s.attach({ productId: pro.id }),
    s.attach({ productId: addon.id }),
  ],
});

// Both products should have discount applied
await expectSubToBeCorrect({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
});
```

---

## Add-On Product Types

| Type | Example | Notes |
|------|---------|-------|
| Free Add-On | Credits, features | No base price |
| Recurring Add-On | $20/mo support tier | Monthly charge |
| Prepaid Add-On | Credit packs | Billing units |
| One-Time Add-On | One-off credits | Single purchase |
| Usage Add-On | Metered features | Overage pricing |

---

## Key Utilities

**Expectation Helpers:**
```typescript
expectProductAttached({ customer, product: addon });
expectProductActive({ customer, productId: addon.id });
expectProductCanceling({ customer, productId: addon.id });
expectProductNotPresent({ customer, productId: addon.id });
expectCustomerProducts({
  customer,
  active: [pro.id],
  canceling: [addon.id],
  notPresent: [oldAddon.id],
});
```

**Subscription Verification:**
```typescript
await expectSubToBeCorrect({
  db: ctx.db,
  customerId,
  org: ctx.org,
  env: ctx.env,
});
```
