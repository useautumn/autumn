# Checkout Test Plan

Tests for payment collection flows during attach operations.

---

## Folder Structure

```
checkout/
├── checkout-mode-decision/          # Tests for computeCheckoutMode logic (TBD)
│   └── (ad-hoc tests once we finalize the checkout mode decision logic)
│
├── stripe-checkout/                  # When checkoutMode = "stripe_checkout"
│   ├── stripe-checkout-basic.test.ts
│   ├── stripe-checkout-entities.test.ts
│   ├── stripe-checkout-one-off.test.ts
│   ├── stripe-checkout-prepaid.test.ts
│   ├── stripe-checkout-trial.test.ts
│   └── stripe-checkout-promo.test.ts
│
└── autumn-checkout/                  # When checkoutMode = "autumn_checkout" (future)
    └── (future work per ENG-1013)
```

**Note:** `invoice/` mode tests are in a top-level folder at `/attach/invoice/` (same pattern as `update-subscription/invoice/`).

---

## Checkout Mode Decision (TBD)

The `computeCheckoutMode` function determines which checkout flow to use. Once we finalize the logic, we'll add comprehensive tests for each branch.

**Current understanding from ENG-1013:**
```typescript
type CheckoutMode = 
  | "stripe_checkout"    // No payment method → Stripe Checkout session
  | "autumn_checkout"    // Has payment method + redirect_mode: "always" → Autumn confirmation page
  | null;                // Has payment method, no redirect → direct billing
```

**Key variables to consider:**
- `hasPaymentMethod` — Does customer have a PM on file?
- `redirect_mode` — `"when_required"` (default) | `"always"`
- `needsSubscriptionUpdate` — Is there an existing subscription to modify?

**Known constraint:** Stripe Checkout can only handle new subscriptions, not updates. If no PM + update needed → Error.

---

## Stripe Checkout Tests

**Prerequisite for all tests:** Customer has NO payment method → triggers `stripe_checkout` mode

### `stripe-checkout-basic.test.ts` (3 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: no product → pro | New customer, no PM, attach pro | `checkout_url` returned, product attached after completion |
| 2 | stripe-checkout: free → pro | Customer on free product, no PM, attach pro | `checkout_url` returned, pro replaces free after completion |
| 3 | stripe-checkout: multi-interval product | No PM, attach product with monthly + annual prices | Checkout handles multi-interval, product attached after completion |

**Setup:**
```typescript
const pro = products.pro({ id: "pro", items: [messagesItem] });

const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true }), // No payment method
    s.products({ list: [pro] }),
  ],
  actions: [],
});

const result = await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,
});

expect(result.checkout_url).toBeDefined();
await completeCheckoutForm(result.checkout_url);

const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductAttached({ customer, product: pro });
```

---

### `stripe-checkout-entities.test.ts` (2 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: entity attach | Customer has no PM, attach to entity-1 | `checkout_url` returned, entity gets product after completion |
| 2 | stripe-checkout: second entity | Entity-1 has product via direct billing, entity-2 needs checkout (no PM) | Entity-2 gets its own checkout flow |

**Setup:**
```typescript
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true }), // No PM
    s.products({ list: [pro] }),
    s.entities({ ids: ["entity-1"] }),
  ],
  actions: [],
});

const result = await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,
  entity_id: "entity-1",
});

expect(result.checkout_url).toBeDefined();
```

---

### `stripe-checkout-one-off.test.ts` (2 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: one-off credits | No PM, attach one-off credits product | Checkout `mode: "payment"` (not subscription), credits granted after |
| 2 | stripe-checkout: one-off with quantity | One-off with `options: [{ quantity: 5 }]` | Quantity reflected in checkout line items |

**Key difference:** One-off products use Stripe Checkout in `mode: "payment"`, not `mode: "subscription"`.

---

### `stripe-checkout-prepaid.test.ts` (2 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: prepaid quantity | No PM, attach prepaid with `options: [{ feature_id, quantity: 200 }]` | Checkout includes prepaid line item with quantity |
| 2 | stripe-checkout: prepaid on free product | Customer has free, attach prepaid pack (no PM) | Checkout for prepaid, free product remains |

---

### `stripe-checkout-trial.test.ts` (2 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: trial card required | Product with `trialDays: 7, cardRequired: true`, no PM | Checkout captures card, trial starts after completion |
| 2 | stripe-checkout: trial subscription_data | Verify checkout has correct `trial_end` and `trial_settings` | `subscription_data.trial_end` set correctly |

**Note:** If `cardRequired: false`, the product might not need checkout at all (no payment collected). TBD on exact behavior.

---

### `stripe-checkout-promo.test.ts` (2 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | stripe-checkout: allow_promotion_codes | Verify Stripe checkout has `allow_promotion_codes: true` | Customer can enter promo code in checkout UI |
| 2 | stripe-checkout: reward applied | Attach with reward/coupon pre-applied | Discount reflected in first invoice after checkout |

---

## Stripe Checkout Test Count

| File | Tests |
|------|-------|
| stripe-checkout-basic.test.ts | 3 |
| stripe-checkout-entities.test.ts | 2 |
| stripe-checkout-one-off.test.ts | 2 |
| stripe-checkout-prepaid.test.ts | 2 |
| stripe-checkout-trial.test.ts | 2 |
| stripe-checkout-promo.test.ts | 2 |
| **Total** | **13** |

---

## Key Utilities

**Checkout Completion:**
```typescript
import { completeCheckoutForm } from "@tests/utils/puppeteer/completeCheckoutForm";
import { completeInvoiceCheckout } from "@tests/utils/puppeteer/completeInvoiceCheckout";
import { completeInvoiceConfirmation } from "@tests/utils/puppeteer/completeInvoiceConfirmation";

// Stripe checkout session (new PM)
await completeCheckoutForm(checkout_url);

// Invoice payment page (with existing PM)
await completeInvoiceCheckout({ url: payment_url });

// 3DS authentication flow
await completeInvoiceConfirmation({ url: payment_url });
```

**Payment Method Setup:**
```typescript
// In initScenario:
s.customer({ paymentMethod: "success" })  // Valid card
s.customer({ paymentMethod: "fail" })     // Card that declines
s.customer({ paymentMethod: "authenticate" }) // Card requiring 3DS

// Actions:
s.attachPaymentMethod({ type: "success" | "fail" | "authenticate" })
s.removePaymentMethod()
```

---

## Future Work

- **`checkout-mode-decision/`** — Once `computeCheckoutMode` logic is finalized, add tests for each decision branch
- **`autumn-checkout/`** — Tests for `redirect_mode: "always"` with payment method (Autumn confirmation page)
- **`invoice/`** — Top-level folder for `invoice: true` mode (see `update-subscription/invoice/` for patterns)
