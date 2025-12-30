# General Test Guide

## Test Context

All tests have access to `ctx` which contains:
- `ctx.org` - Test organization
- `ctx.db` - Database connection
- `ctx.features` - Organization features

## Initializing Autumn Clients

### Secret Key (Default)
```typescript
const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
```

### Public Key
```typescript
const autumnPublic = new AutumnInt({
  version: ApiVersion.V1_2,
  secretKey: ctx.org.test_pkey!,
});
```

### With Custom Config
```typescript
const autumn = new AutumnInt({
  version: ApiVersion.V1_2,
  orgConfig: { include_past_due: true },
});
```

## API Versions

- `ApiVersion.V0_2` - Legacy v0 API
- `ApiVersion.V1_2` - Current v1 API

## Common Test Patterns

### Wait for Async Processing
```typescript
await new Promise((resolve) => setTimeout(resolve, 2000));
```

### Get Customer with Feature Balance
```typescript
const customer: any = await autumn.customers.get(customerId);
const balance = customer.features[TestFeature.Messages].balance;
const used = customer.features[TestFeature.Messages].used;
```

### Expect Error (Use This Instead of try-catch!)

**Always use `expectAutumnError` instead of manual try-catch blocks:**

```typescript
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";

// ✅ GOOD - Use expectAutumnError
await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: async () => {
    await autumn.customers.get("invalid-id");
  },
});

// ✅ GOOD - Test for duplicate idempotency key
await expectAutumnError({
  errCode: ErrCode.DuplicateIdempotencyKey,
  func: async () => {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      idempotency_key: "same-key",
    });
  },
});

// ❌ BAD - Don't use try-catch
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

## Public Key Restrictions

Public keys can only access:
- `GET /v1/products`
- `POST /v1/entitled`
- `POST /v1/check`
- `POST /v1/attach`
- `GET /v1/customers/:customerId`

Public keys CANNOT:
- Send events (`send_event: true` is silently ignored)
- Access other endpoints

## Test Organization

- `beforeAll` - Setup (create customers, products, attach)
- `test` - Individual test cases
- Use descriptive test names with `chalk.yellowBright()`

## Customer Initialization

### Payment Methods
**IMPORTANT:** If your product has ANY price (overage, per-seat, usage-based, etc.), you MUST attach a payment method:

```typescript
// ✅ GOOD - Product with prices requires payment method
await initCustomerV3({
  ctx,
  customerId,
  attachPm: "success",  // Required for any paid features
  withTestClock: false,
});

// ❌ BAD - Product with prices but no payment method
await initCustomerV3({
  ctx,
  customerId,
  withTestClock: false,  // Missing attachPm: "success"
});
```

Use `attachPm: "success"` when:
- Product has overage pricing (arrear items)
- Product has per-seat pricing
- Product has usage-based billing
- Any feature can trigger billing

Omit `attachPm` only for:
- Completely free products (no prices at all)
- Tests that don't require billing

## Constructing Feature Items

### Lifetime (One-off) Features
For lifetime features that never reset, pass `interval: null`:

```typescript
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// ✅ GOOD - Lifetime feature (no reset)
const lifetimeMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 200,
  interval: null,  // null = lifetime/one-off
});

// Monthly feature (default)
const monthlyMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 100,
  // interval defaults to ProductItemInterval.Month
});
```

**Note:** `interval: null` is different from `ProductItemInterval.Lifetime`. Use `null` when constructing feature items for lifetime balances.

## Common Pitfalls

### Wait for Sync Before Attach (after Track)

`track` updates Redis immediately but syncs to Postgres **asynchronously**. `attach` rebuilds the customer cache from Postgres. If you call them back-to-back, the cache gets stale data.

```typescript
// ❌ BAD
await autumnV2.track({ ... });
await autumnV2.attach({ ... });  // Cache rebuilt from stale Postgres

// ✅ GOOD
await autumnV2.track({ ... });
await timeout(2000);
await autumnV2.attach({ ... });
```

Not an issue if you attach all products in `beforeAll` before any tracking.

## Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
```

