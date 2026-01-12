# Subscription Update Billing Guide

## Proration & Charges

When updating a subscription via `subscriptions.update` (custom plan), charges/credits are calculated based on the billing model:

### Billing Models

| Model | On Update Behavior |
|-------|-------------------|
| **Base Price** | Prorated charge/credit for price difference |
| **Consumable** | No immediate overage charge (billed in arrears at cycle end) |
| **Allocated** | Prorated charge for current overage above new included amount |
| **Prepaid** | Full refund of previous prepaid, full charge for new prepaid |

### Detailed Behavior

#### 1. Base Price Changes
- **Increase**: Charge prorated difference for remaining cycle
- **Decrease**: Credit prorated difference for remaining cycle
- **Remove**: Credit full remaining prorated amount

```typescript
// $20/mo -> $30/mo at start of cycle = charge $10
expect(preview.total).toBe(10);

// $30/mo -> $20/mo at start of cycle = credit $10
expect(preview.total).toBe(-10);

// Mid-cycle (15 days): $20/mo -> $30/mo = charge ~$5 (prorated)
expect(preview.total).toBe(5);
```

#### 2. Consumable Features
- **Never** charge overage on update
- Overage is billed at end of billing cycle
- Even if usage exceeds new included amount, preview.total = 0 for the consumable portion

```typescript
// 80 used, 50 included = 30 overage, but...
expect(preview.total).toBe(0); // Consumable overage NOT charged on update
```

#### 3. Allocated Features (Seat-Based)
- Charge prorated amount for overage seats above new included amount
- Based on current usage vs new included allowance

```typescript
// Using 5 seats, decrease included from 5 to 3
// Overage = 5 - 3 = 2 seats @ $10/seat = $20
expect(preview.total).toBe(20);

// Using 2 seats, increase included from 2 to 5
// No overage, no charge
expect(preview.total).toBe(0);
```

##### ⚠️ Important: Allocated Features Create Invoices on Track

For allocated features (seat-based / prorated billing), **tracking usage past the included boundary immediately creates a prorated invoice**. This is handled in `adjustAllowance.ts`.

This means:
- When `track()` causes usage to exceed included seats, an invoice is created immediately
- This is different from consumable features, which only bill at cycle end

```typescript
// Example: Product with 3 included seats @ $10/seat overage
// Customer tracks 5 seats (2 over included)

await autumnV1.track({
  customer_id: customerId,
  feature_id: TestFeature.Users,
  value: 5,  // 2 over the 3 included
});

// This immediately creates an invoice for the 2 extra seats (prorated)
// Invoice count is now: 1 (initial) + 1 (track overage) = 2

// Later, when updating subscription:
await autumnV1.subscriptions.update(updateParams);

// Invoice count becomes: 1 (initial) + 1 (track overage) + 1 (update) = 3
```

This affects invoice count expectations in tests:
- Usage within included: No extra invoice from track
- Usage exceeds included: +1 invoice from track

#### 4. Prepaid Features

**Prepaid features require `options` with `quantity`** when attaching or updating. The `quantity` is:
- The **total units** you want (NOT multiplied by billing_units)
- **NOT** inclusive of `included_usage` (included_usage is separate free balance)

Billing logic on update:
1. **Refund** previous prepaid amount: `old_packs * old_price`
2. **Charge** new prepaid amount: `new_packs * new_price`
3. **preview.total** = new charge - old refund

```typescript
// Setup: $10 per 100 units (1 pack = 100 units at $10)
const prepaidItem = items.prepaidMessages({
  includedUsage: 0,
  billingUnits: 100,
  price: 10,
});

// Attach with 2 packs (200 units)
await initScenario({
  actions: [
    s.attach({
      productId: "pro",
      options: [{ feature_id: TestFeature.Messages, quantity: 200 }], // 2 packs
    }),
  ],
});

// Upgrade to 5 packs (500 units)
const preview = await autumnV1.subscriptions.previewUpdate({
  customer_id: customerId,
  product_id: pro.id,
  options: [{ feature_id: TestFeature.Messages, quantity: 500 }], // 5 packs
});

// preview.total = (5 - 2) * $10 = $30
expect(preview.total).toBe(30);

// Downgrade to 3 packs (300 units)
const preview2 = await autumnV1.subscriptions.previewUpdate({
  customer_id: customerId,
  product_id: pro.id,
  options: [{ feature_id: TestFeature.Messages, quantity: 300 }], // 3 packs
});

// preview.total = (3 - 5) * $10 = -$20 (credit)
expect(preview2.total).toBe(-20);
```

##### Prepaid with Price/Billing Unit Changes

When changing price or billing units via `items`, the calculation uses old and new pack costs:

```typescript
// Old: 3 packs of 100 @ $10 = $30
// New: 3 packs of 100 @ $15 = $45
// preview.total = $45 - $30 = $15
expect(preview.total).toBe(15);

// Old: 300 units / 100 = 3 packs @ $10 = $30
// New: 300 units / 50 = 6 packs @ $10 = $60
// preview.total = $60 - $30 = $30
expect(preview.total).toBe(30);
```

### Preview vs Invoice Matching

Always verify that `preview.total` matches the actual invoice:

```typescript
const updateParams = {
  customer_id: customerId,
  product_id: pro.id,
  items: [newItem, priceItem],
};

const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
expect(preview.total).toBe(expectedAmount);

await autumnV1.subscriptions.update(updateParams);

const customer = await autumnV1.customers.get(customerId);
await expectCustomerInvoiceCorrect({
  customer,
  count: expectedInvoiceCount,
  latestTotal: preview.total,
});
```

### Invoice Count Guidelines

| Transition | Expected Count |
|------------|---------------|
| Free-to-Free | 0 |
| Free-to-Paid | 1 |
| Paid-to-Paid (upgrade/downgrade) | Initial (1) + Update (1) = 2 |
| Paid-to-Paid (allocated to prepaid) | Initial (1) + Arrear Settlement (1) + Prepaid (1) = 3 |

#### Allocated Feature Invoice Counts

For allocated features, invoice count depends on whether usage exceeded included at any point:

| Scenario | Invoice Count |
|----------|--------------|
| Usage stays within included, then update | Initial (1) + Update (1) = 2 |
| Usage exceeds included via track, then update | Initial (1) + Track Overage (1) + Update (1) = 3 |
| Usage exceeds included via track, update increases included to cover usage | Initial (1) + Track Overage (1) + Update Credit (1) = 3 |

```typescript
// Example: 3 included seats, track 5 seats (2 over), then increase to 10 included
await expectCustomerInvoiceCorrect({
  customer,
  count: 3,  // 1 (attach) + 1 (track overage) + 1 (update credit)
  latestTotal: preview.total,
});
```

### No-Charge Updates

These updates should have `preview.total = 0`:
- Adding/removing boolean features (no price impact)
- Changing included usage (no billing attached)
- Changing feature intervals (month → week)
- Updating consumable features (overage not charged on update)
- Increasing allocated seats when within included amount

