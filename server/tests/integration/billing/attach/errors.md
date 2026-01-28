# Errors Test Plan

Tests for validation errors, payment failures, and edge cases in attach operations.

---

## File Structure

| File | Test Count | Description |
|------|------------|-------------|
| `errors-validation.test.ts` | 8 | Missing/invalid parameters |
| `errors-payment.test.ts` | 5 | Payment failures and recovery |
| `errors-product.test.ts` | 6 | Product-related errors |
| `errors-options.test.ts` | 5 | Invalid feature options |
| `errors-transition.test.ts` | 6 | Invalid product transitions |
| `errors-idempotency.test.ts` | 3 | Duplicate requests |

**Total: 33 tests**

---

## Common Error Codes

```typescript
import { ErrCode, AttachErrCode } from "@autumn/shared";

// General errors
ErrCode.InvalidRequest       // General validation error
ErrCode.InvalidOptions       // Missing/invalid options
ErrCode.NotFound             // Resource not found
ErrCode.ProductNotFound      // Product/version not found
ErrCode.CustomerNotFound     // Customer not found
ErrCode.DuplicateIdempotencyKey // Duplicate request

// Attach-specific errors
AttachErrCode.ProductAlreadyAttached  // Already has this product
```

---

## Test Details

### `errors-validation.test.ts` (8 tests)

| # | Test Name | Scenario | Expected Error |
|---|-----------|----------|----------------|
| 1 | error: missing customer_id | Attach without customer_id | `ErrCode.InvalidRequest` |
| 2 | error: missing product_id | Attach without product_id | `ErrCode.InvalidRequest` |
| 3 | error: invalid customer_id | Non-existent customer | `ErrCode.CustomerNotFound` |
| 4 | error: invalid product_id | Non-existent product | `ErrCode.ProductNotFound` |
| 5 | error: invalid entity_id | Non-existent entity | `ErrCode.NotFound` |
| 6 | error: invalid version | Product version doesn't exist | `ErrCode.ProductNotFound` |
| 7 | error: negative version | `version: -1` | `ErrCode.InvalidRequest` |
| 8 | error: empty options array | `options: []` when required | `ErrCode.InvalidOptions` |

**Pattern:**
```typescript
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";

await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: async () => {
    await autumnV1.attach({
      customer_id: "non-existent-customer",
      product_id: pro.id,
    });
  },
});
```

---

### `errors-payment.test.ts` (5 tests)

| # | Test Name | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| 1 | error: no payment method | Paid product, no PM | `checkout_url` returned or error |
| 2 | error: payment declined | PM set to fail | `checkout_url` returned, product not upgraded |
| 3 | error: 3ds required | PM requires 3DS | `required_action.code: "3ds_required"` |
| 4 | error: payment fails mid-upgrade | Upgrade with failed PM | Customer stays on old product |
| 5 | error: insufficient funds | Card declined for amount | `checkout_url` for retry |

**Pattern:**
```typescript
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "fail" }),
    s.products({ list: [pro] }),
  ],
});

const result = await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,
});

// Payment failed, checkout URL provided
expect(result.checkout_url).toBeDefined();
expect(result.code).toBe(SuccessCode.InvoiceActionRequired);
```

---

### `errors-product.test.ts` (6 tests)

| # | Test Name | Scenario | Expected Error |
|---|-----------|----------|----------------|
| 1 | error: product already attached | Attach same product twice | `AttachErrCode.ProductAlreadyAttached` |
| 2 | error: attach same options | Prepaid with identical options | `AttachErrCode.ProductAlreadyAttached` |
| 3 | error: archived product | Attach archived product | `ErrCode.ProductNotFound` |
| 4 | error: draft product | Attach draft/unpublished product | `ErrCode.ProductNotFound` |
| 5 | error: entity product without entity_id | Entity-scoped product, no entity_id | `ErrCode.InvalidRequest` |
| 6 | error: non-entity product with entity_id | Customer product with entity_id | `ErrCode.InvalidRequest` |

**Pattern:**
```typescript
// Already attached
await autumnV1.attach({ customer_id: customerId, product_id: pro.id });

await expectAutumnError({
  errCode: AttachErrCode.ProductAlreadyAttached,
  func: async () => {
    await autumnV1.attach({ customer_id: customerId, product_id: pro.id });
  },
});
```

---

### `errors-options.test.ts` (5 tests)

| # | Test Name | Scenario | Expected Error |
|---|-----------|----------|----------------|
| 1 | error: prepaid missing quantity | Prepaid product, no options | `ErrCode.InvalidOptions` |
| 2 | error: invalid feature_id in options | Non-existent feature_id | `ErrCode.InvalidOptions` |
| 3 | error: negative quantity | `quantity: -10` | `ErrCode.InvalidOptions` |
| 4 | error: zero quantity | `quantity: 0` | `ErrCode.InvalidOptions` |
| 5 | error: options for non-prepaid | Options on usage-based product | `ErrCode.InvalidOptions` |

**Pattern:**
```typescript
const prepaid = products.pro({
  id: "prepaid",
  items: [items.prepaidCredits({ billingUnits: 100, pricePerUnit: 10_00 })],
});

// Missing options
await expectAutumnError({
  errCode: ErrCode.InvalidOptions,
  errMessage: "missing options",
  func: async () => {
    await autumnV1.attach({
      customer_id: customerId,
      product_id: prepaid.id,
      // No options provided!
    });
  },
});

// Negative quantity
await expectAutumnError({
  errCode: ErrCode.InvalidOptions,
  func: async () => {
    await autumnV1.attach({
      customer_id: customerId,
      product_id: prepaid.id,
      options: [{ feature_id: TestFeature.Credits, quantity: -10 }],
    });
  },
});
```

---

### `errors-transition.test.ts` (6 tests)

| # | Test Name | Scenario | Expected Error/Behavior |
|---|-----------|----------|-------------------------|
| 1 | error: recurring to one-off | Pro (recurring) → one-off credits | `ErrCode.InvalidRequest` |
| 2 | error: one-off to recurring | One-off → Pro (recurring) | `ErrCode.InvalidRequest` |
| 3 | error: paid recurring to one-off | Paid monthly → one-off | `ErrCode.InvalidRequest` |
| 4 | error: downgrade with invoice mode | Downgrade with `invoice: true` | `ErrCode.InvalidRequest` |
| 5 | error: free to paid next_cycle_only | Free → paid with `next_cycle_only: true` | `ErrCode.InvalidRequest` |
| 6 | error: remove trial with next_cycle_only | Remove trial + `next_cycle_only: true` | `ErrCode.InvalidRequest` |

**Pattern:**
```typescript
const recurring = products.pro({ id: "recurring", items: [...] });
const oneOff = products.oneOff({ id: "one-off", items: [...] });

// Attach recurring first
await autumnV1.attach({ customer_id: customerId, product_id: recurring.id });

// Try to switch to one-off
await expectAutumnError({
  errCode: ErrCode.InvalidRequest,
  errMessage: "Cannot transition from recurring to one-off",
  func: async () => {
    await autumnV1.attach({
      customer_id: customerId,
      product_id: oneOff.id,
    });
  },
});
```

---

### `errors-idempotency.test.ts` (3 tests)

| # | Test Name | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| 1 | idempotency: same key same request | Duplicate request with same key | Returns cached response (200) |
| 2 | idempotency: same key different request | Same key, different params | `ErrCode.DuplicateIdempotencyKey` (409) |
| 3 | idempotency: concurrent requests | Two requests same key simultaneously | One succeeds, one returns 409 |

**Pattern:**
```typescript
const idempotencyKey = `attach-${Date.now()}`;

// First request
const result1 = await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,
  idempotency_key: idempotencyKey,
});

// Same request, same key - returns cached
const result2 = await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,
  idempotency_key: idempotencyKey,
});

expect(result1).toEqual(result2);

// Different request, same key - error
await expectAutumnError({
  errCode: ErrCode.DuplicateIdempotencyKey,
  func: async () => {
    await autumnV1.attach({
      customer_id: customerId,
      product_id: premium.id, // Different product!
      idempotency_key: idempotencyKey,
    });
  },
});
```

---

## Key Utilities

**Error Expectation:**
```typescript
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";

await expectAutumnError({
  errCode: ErrCode.InvalidRequest,  // Optional: specific error code
  errMessage: "substring to match", // Optional: error message substring
  func: async () => {
    // Code that should throw
  },
});
```

**Payment Method Setup for Error Testing:**
```typescript
// In initScenario setup:
s.customer({ paymentMethod: "fail" })        // Will decline
s.customer({ paymentMethod: "authenticate" }) // Requires 3DS

// In actions:
s.attachPaymentMethod({ type: "fail" })
s.removePaymentMethod()
```

**Verify Customer State Unchanged:**
```typescript
// Before error
const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);

// Trigger error
await expectAutumnError({ ... });

// After error - state unchanged
const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expect(after.products).toEqual(before.products);
expect(after.entitlements).toEqual(before.entitlements);
```
