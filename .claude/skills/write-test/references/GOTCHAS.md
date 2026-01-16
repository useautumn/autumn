# Common Gotchas and Debugging

## Test Context (`ctx`)

All tests have access to `ctx` which contains:
```typescript
import ctx from "@tests/utils/testInitUtils/createTestContext.js";

ctx.org        // Test organization
ctx.db         // Database connection
ctx.features   // Organization features
ctx.stripeCli  // Stripe client
ctx.env        // Environment (sandbox)
```

## Autumn Client Initialization

### Default (Secret Key)
```typescript
const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
```

### Public Key (Limited Access)
```typescript
const autumnPublic = new AutumnInt({
  version: ApiVersion.V1_2,
  secretKey: ctx.org.test_pkey!,
});
```

**Public key restrictions:**
- Can only access: `GET /products`, `POST /entitled`, `POST /check`, `POST /attach`, `GET /customers/:id`
- Cannot send events (`send_event: true` is silently ignored)

### With Custom Config
```typescript
const autumn = new AutumnInt({
  version: ApiVersion.V1_2,
  orgConfig: { include_past_due: true },
});
```

## Payment Method Required for Paid Features

**If your product has ANY price, you MUST attach a payment method:**

```typescript
// CORRECT - Product with prices
s.customer({ paymentMethod: "success" })

// OR with legacy init:
await initCustomerV3({
  ctx,
  customerId,
  attachPm: "success",  // Required!
});

// WRONG - Missing payment method for paid product
s.customer({})  // Will fail on billing
```

Use `paymentMethod: "success"` when product has:
- Overage pricing (arrear items)
- Per-seat pricing
- Usage-based billing
- Any base price

## Test Clock Issues

### `Date.now()` Doesn't Change

```typescript
// WRONG
expect(trialEndsAt).toBeCloseTo(Date.now() + ms.days(14));

// CORRECT - Use advancedTo from initScenario
expect(trialEndsAt).toBeCloseTo(advancedTo + ms.days(14));
```

### Test Clock Must Be Enabled

```typescript
// testClock defaults to true, but if disabled:
s.customer({ testClock: false })

// Then s.advanceTestClock will throw
```

## Product ID Issues

### Always Use `product.id`, Not Strings

```typescript
// WRONG
s.attach({ productId: "pro" })
await autumnV1.attach({ product_id: `pro_${customerId}` });

// CORRECT
s.attach({ productId: pro.id })
await autumnV1.attach({ product_id: pro.id });
```

Products are mutated by `initScenario` to include the prefix. Using `product.id` ensures correct prefixed ID.

## Error Testing

### Use `expectAutumnError`, Not try-catch

```typescript
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { ErrCode } from "@autumn/shared";

// CORRECT
await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: async () => {
    await autumn.customers.get("invalid-id");
  },
});

// WRONG - Don't use try-catch
let errorThrown = false;
try {
  await autumn.customers.get("invalid-id");
} catch (error) {
  errorThrown = true;
}
expect(errorThrown).toBe(true);
```

**Common Error Codes:**
- `ErrCode.CustomerNotFound`
- `ErrCode.ProductNotFound`
- `ErrCode.FeatureNotFound`
- `ErrCode.InsufficientBalance`
- `ErrCode.DuplicateIdempotencyKey`
- `ErrCode.InvalidRequest`

## Lifetime/One-Off Interval Values

### Constructing Features

Use `interval: null` for lifetime features:

```typescript
const lifetimeMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 200,
  interval: null,  // null = lifetime/one-off
});
```

### In API Responses

Lifetime breakdowns use `"one_off"`, NOT `null`:

```typescript
// API response structure:
{
  "reset": {
    "interval": "one_off",  // NOT null!
    "resets_at": null
  }
}

// CORRECT - Use ResetInterval enum
import { ResetInterval } from "@autumn/shared";

const lifetimeBreakdown = res.balance?.breakdown?.find(
  b => b.reset?.interval === ResetInterval.OneOff
);

// WRONG - null won't match
const wrong = res.balance?.breakdown?.find(
  b => b.reset?.interval === null  // Won't find lifetime!
);
```

## Prepaid Gotchas

### Quantity Required

```typescript
// WRONG - Missing options
s.attach({ productId: pro.id })

// CORRECT
s.attach({
  productId: pro.id,
  options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
})
```

### Quantity Rounds UP to Billing Units

```typescript
// With billingUnits: 100:
// quantity: 50  → rounds to 100 credits
// quantity: 150 → rounds to 200 credits

// To get exactly 50, use billingUnits: 1 or billingUnits: 50
```

### Quantity Goes to `purchased_balance`, Not `granted_balance`

```typescript
// With includedUsage: 0, billingUnits: 100, quantity: 50:
// - Rounds to 100
// - granted_balance: 0 (from includedUsage)
// - purchased_balance: 100 (from quantity)
// - current_balance: 100 (total)
```

## Multiple Products

### Unique IDs Required

```typescript
// WRONG - Same default ID
const prod1 = constructProduct({ type: "free", items: [...] });
const prod2 = constructProduct({ type: "free", items: [...] });

// CORRECT
const prod1 = constructProduct({ type: "free", id: "prod1", items: [...] });
const prod2 = constructProduct({ type: "free", id: "prod2", items: [...] });
```

### Second Product Needs `isAddOn: true`

Without it, second product **replaces** the first:

```typescript
// WRONG - prod2 replaces prod1
const prod1 = constructProduct({ type: "free", id: "prod1", ... });
const prod2 = constructProduct({ type: "free", id: "prod2", ... });

// CORRECT
const prod1 = constructProduct({ type: "free", id: "prod1", ... });
const prod2 = constructProduct({ type: "free", id: "prod2", isAddOn: true, ... });
```

## Product States After Downgrade

When downgrading from Product A to Product B:
- **Product A**: enters "canceling" state (`status: "active"` but `canceled_at` is set)
- **Product B**: enters "scheduled" state (`status: "scheduled"`)

After billing cycle ends:
- **Product A**: removed/expired
- **Product B**: becomes "active"

```typescript
// After downgrade:
await expectProductCanceling({ customer, productId: premium.id });
await expectProductScheduled({ customer, productId: pro.id });

// After billing cycle:
await expectProductNotPresent({ customer, productId: premium.id });
await expectProductActive({ customer, productId: pro.id });
```

## Sync Timing Issues

### Wait After Track Before Attach

`track` updates Redis immediately but syncs to Postgres asynchronously. `attach` rebuilds cache from Postgres.

```typescript
// WRONG - Cache gets stale data
await autumnV1.track({ ... });
await autumnV1.attach({ ... });

// CORRECT
await autumnV1.track({ ... });
await new Promise(r => setTimeout(r, 2000));
await autumnV1.attach({ ... });
```

Not an issue if you attach all products in setup before tracking.

### Cache vs Database Verification

```typescript
// Cached (immediate)
const cached = await autumnV1.customers.get(customerId);

// Database (skip cache)
await new Promise(r => setTimeout(r, 2000));
const fromDb = await autumnV1.customers.get(customerId, { skip_cache: "true" });
```

## Invoice Count Mismatches

### Allocated Features Create Invoices on Track

```typescript
// Product: 3 included seats @ $10/seat overage
await autumnV1.track({ value: 5 });  // 2 over included
// Invoice count = attach (1) + track overage (1) = 2
```

### Consumable Features Don't Charge on Update

```typescript
// Overage billed at cycle end, not on update
expect(preview.total).toBe(0);  // Even with overage
```

### Prepaid Refund/Charge Logic

```typescript
// Old: 2 packs @ $10 = $20
// New: 5 packs @ $10 = $50
// preview.total = $50 - $20 = $30 (NOT $50!)
```

## Free-to-Free Tests

Skip `expectSubToBeCorrect` for free products (no Stripe subscription exists):

```typescript
// Free-to-free: No subscription check
expectCustomerFeatureCorrect({ ... });
// Don't call expectSubToBeCorrect

// Free-to-paid or paid-to-paid: Check subscription
await expectSubToBeCorrect({ db: ctx.db, customerId, org: ctx.org, env: ctx.env });
```

## Server Logs Not Visible

Console logs in server code don't appear in test output. Ask the user to check server logs directly.

## Decimal.js for Balance Calculations

```typescript
import { Decimal } from "decimal.js";

// WRONG - Floating point error
expect(balance).toBe(100 - 23.47);

// CORRECT
expect(balance).toBe(new Decimal(100).sub(23.47).toNumber());
```
