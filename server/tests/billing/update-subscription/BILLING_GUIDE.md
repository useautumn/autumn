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

#### 4. Prepaid Features
- Refund full previous prepaid amount
- Charge full new prepaid amount

```typescript
// Had 100 units prepaid @ $10, now buying 200 @ $10
// = -$10 (refund) + $20 (new) = $10
expect(preview.total).toBe(10);

// Switching from prepaid to non-prepaid
// = -$10 (full refund)
expect(preview.total).toBe(-10);
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

### No-Charge Updates

These updates should have `preview.total = 0`:
- Adding/removing boolean features (no price impact)
- Changing included usage (no billing attached)
- Changing feature intervals (month → week)
- Updating consumable features (overage not charged on update)
- Increasing allocated seats when within included amount

