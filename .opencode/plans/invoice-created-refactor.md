# Invoice Created Webhook Refactor Plan

This document outlines the implementation plan for refactoring the `invoice.created` webhook handler, adding expired customer products caching, and creating the `upsertAutumnInvoice` function.

## Overview

The `invoice.created` webhook needs several enhancements:

1. **Expired Customer Products Cache** - When `subscription.deleted` expires customer products, cache them so `invoice.created` can still access them for processing prepaid/allocated prices
2. **Upsert Autumn Invoice** - Create/update Autumn invoice records on `invoice.created` (skip first invoice)
3. **Test Coverage** - Migrate/create tests for prepaid and allocated price processing

---

## Phase A: Expired Customer Products Cache System ✅ COMPLETED

**Goal:** Allow `subscription.deleted` to cache expired customer products so `invoice.created` can access them.

**Problem:** When a subscription is deleted, we expire customer products in our DB. But `invoice.created` may fire shortly after and needs those customer products to process prepaid/allocated prices correctly. Currently, `getByStripeSubId` with `ALL_STATUSES` fetches expired products, but there's a race condition risk.

**Solution:** Cache expired customer products in Redis when they're expired, then merge them in `setupInvoiceCreatedContext`.

### Tasks

| Task | Description | File(s) |
|------|-------------|---------|
| A1 | Create `setExpiredCustomerProductsCache.ts` | `server/src/internal/customers/cusProducts/actions/expiredCache/setExpiredCustomerProductsCache.ts` |
| A2 | Create `getExpiredCustomerProductsCache.ts` | `server/src/internal/customers/cusProducts/actions/expiredCache/getExpiredCustomerProductsCache.ts` |
| A3 | Create `expiredCache/index.ts` barrel export | `server/src/internal/customers/cusProducts/actions/expiredCache/index.ts` |
| A4 | Update `actions/index.ts` to add `expiredCache: { set, get }` | `server/src/internal/customers/cusProducts/actions/index.ts` |
| A5 | Update `expireAndActivateCustomerProducts.ts` to call `expiredCache.set()` at end | `server/src/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/expireAndActivateCustomerProducts.ts` |
| A6 | Update `setupInvoiceCreatedContext.ts` to call `expiredCache.get()` and merge | `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.ts` |

### File Details

#### A1: `setExpiredCustomerProductsCache.ts`

```typescript
import type { FullCusProduct } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const getExpiredCacheKey = (stripeSubscriptionId: string) =>
  `expired-cus-products:${stripeSubscriptionId}`;

export const setExpiredCustomerProductsCache = async ({
  stripeSubscriptionId,
  customerProducts,
}: {
  stripeSubscriptionId: string;
  customerProducts: FullCusProduct[];
}): Promise<void> => {
  const key = getExpiredCacheKey(stripeSubscriptionId);
  // 5 minute TTL - enough time for invoice.created to process
  await CacheManager.setJson(key, customerProducts, 300);
};
```

#### A2: `getExpiredCustomerProductsCache.ts`

```typescript
import type { FullCusProduct } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const getExpiredCacheKey = (stripeSubscriptionId: string) =>
  `expired-cus-products:${stripeSubscriptionId}`;

export const getExpiredCustomerProductsCache = async ({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> => {
  const key = getExpiredCacheKey(stripeSubscriptionId);
  return await CacheManager.getJson<FullCusProduct[]>(key);
};
```

#### A3: `expiredCache/index.ts`

```typescript
export { setExpiredCustomerProductsCache } from "./setExpiredCustomerProductsCache";
export { getExpiredCustomerProductsCache } from "./getExpiredCustomerProductsCache";
```

#### A4: Updated `actions/index.ts`

```typescript
import { activateScheduledCustomerProduct } from "./activateScheduled";
import { deleteScheduledCustomerProduct } from "./deleteScheduledCustomerProduct";
import { expireCustomerProductAndActivateDefault } from "./expireAndActivateDefault";
import { setExpiredCustomerProductsCache, getExpiredCustomerProductsCache } from "./expiredCache";

export const customerProductActions = {
  expireAndActivateDefault: expireCustomerProductAndActivateDefault,
  activateScheduled: activateScheduledCustomerProduct,
  deleteScheduled: deleteScheduledCustomerProduct,
  expiredCache: {
    set: setExpiredCustomerProductsCache,
    get: getExpiredCustomerProductsCache,
  },
};

export {
  expireCustomerProductAndActivateDefault,
  activateScheduledCustomerProduct,
  deleteScheduledCustomerProduct,
};
```

#### A5: Changes to `expireAndActivateCustomerProducts.ts`

At the end of the function, after processing all customer products:

```typescript
// Cache the expired products for invoice.created
await customerProductActions.expiredCache.set({
  stripeSubscriptionId: stripeSubscription.id,
  customerProducts,
});
```

#### A6: Changes to `setupInvoiceCreatedContext.ts`

After fetching customer products from DB (~line 77):

```typescript
// Merge in any cached expired customer products
const cachedExpired = await customerProductActions.expiredCache.get({
  stripeSubscriptionId,
});

if (cachedExpired && cachedExpired.length > 0) {
  const existingIds = new Set(customerProducts.map(cp => cp.id));
  const expiredToAdd = cachedExpired.filter(cp => !existingIds.has(cp.id));
  customerProducts.push(...expiredToAdd);
  
  logger.info(
    `[invoice.created] Added ${expiredToAdd.length} cached expired products`,
  );
}
```

---

## Phase B: Upsert Autumn Invoice on invoice.created ✅ COMPLETED

**Goal:** Create/update Autumn invoice record when Stripe sends `invoice.created` webhook, but skip the first invoice (`billing_reason: subscription_create`).

**Reference:** Similar to `upsertInvoiceFromBilling.ts` but adapted for webhook context.

### Tasks

| Task | Description | File(s) |
|------|-------------|---------|
| B1 | Create `upsertAutumnInvoice.ts` task | `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/upsertAutumnInvoice.ts` |
| B2 | Update `handleStripeInvoiceCreated.ts` to call `upsertAutumnInvoice()` | `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated.ts` |

### File Details

#### B1: `upsertAutumnInvoice.ts`

```typescript
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

export const upsertAutumnInvoice = async ({
  ctx,
  eventContext,
}: {
  ctx: StripeWebhookContext;
  eventContext: InvoiceCreatedContext;
}): Promise<void> => {
  const { stripeInvoice, customerProducts, fullCustomer } = eventContext;

  // Skip first invoice (subscription_create)
  if (stripeInvoice.billing_reason === "subscription_create") {
    ctx.logger.debug("[invoice.created] Skipping invoice upsert for subscription_create");
    return;
  }

  const productIds = [...new Set(customerProducts.map(cp => cp.product.id))];
  const internalProductIds = [...new Set(customerProducts.map(cp => cp.internal_product_id))];
  const internalCustomerId = fullCustomer.internal_id;
  
  // Entity ID - if all customer products have same entity, use it
  const internalEntityId = customerProducts.length > 0 && customerProducts.every(
    cp => cp.internal_entity_id === customerProducts[0].internal_entity_id
  ) ? customerProducts[0].internal_entity_id : null;

  // Try update first
  const updated = await InvoiceService.updateByStripeId({
    db: ctx.db,
    stripeId: stripeInvoice.id,
    updates: {
      product_ids: productIds,
      internal_product_ids: internalProductIds,
    },
  });

  if (updated) return;

  // Create new
  await InvoiceService.createInvoiceFromStripe({
    db: ctx.db,
    stripeInvoice,
    internalCustomerId,
    internalEntityId,
    org: ctx.org,
    productIds,
    internalProductIds,
    items: [],
  });
};
```

#### B2: Changes to `handleStripeInvoiceCreated.ts`

Add import and call after price processing:

```typescript
import { upsertAutumnInvoice } from "./tasks/upsertAutumnInvoice";

// ... existing code ...

await processConsumablePricesForInvoiceCreated({ ctx, eventContext });
await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
await processAllocatedPricesForInvoiceCreated({ ctx, eventContext });

// Upsert Autumn invoice record
await upsertAutumnInvoice({ ctx, eventContext });
```

---

## Phase C: Migrate/Create Tests for invoice.created Prepaid & Allocated Prices

**Goal:** Ensure test coverage for the refactored `processPrepaidPricesForInvoiceCreated.ts` and `processAllocatedPricesForInvoiceCreated.ts`.

**Location:** `server/tests/integration/billing/stripe-webhooks/invoice-created/`

### Tasks

| Task | Description | File(s) |
|------|-------------|---------|
| C1 | Create `invoice-created-prepaid.test.ts` | `server/tests/integration/billing/stripe-webhooks/invoice-created/invoice-created-prepaid.test.ts` |
| C2 | Create `invoice-created-allocated.test.ts` | `server/tests/integration/billing/stripe-webhooks/invoice-created/invoice-created-allocated.test.ts` |

### Test Scenarios

#### C1: `invoice-created-prepaid.test.ts`

Tests for `processPrepaidPricesForInvoiceCreated.ts` (UsageInAdvance billing type).

**Scenarios to test:**

1. **Basic prepaid reset** - Attach with quantity → advance cycle → verify balance resets to quantity * billingUnits
2. **Prepaid with upcoming_quantity** - Set upcoming_quantity mid-cycle → advance cycle → verify balance resets to new quantity
3. **Prepaid lifetime interval** - Lifetime prepaid should NOT reset on cycle (handled specially)
4. **Prepaid with rollover** - If rollover is configured, verify rollover records are created

**Reference existing tests:** `/server/tests/attach/prepaid/prepaid1.test.ts`, `prepaid3.test.ts`

#### C2: `invoice-created-allocated.test.ts`

Tests for `processAllocatedPricesForInvoiceCreated.ts` (InArrearProrated billing type).

**Scenarios to test:**

1. **Replaceables deleted on cycle** - Add seats mid-cycle (creates replaceables with `delete_next_cycle: true`) → advance cycle → verify replaceables removed and balance incremented
2. **No replaceables** - Normal cycle without mid-cycle changes → verify no changes
3. **Multiple linked entitlements** - Replaceables affect multiple linked customer entitlements

**Reference existing tests:** `/server/tests/integration/crud/entities/create-entity/create-entity-paid.test.ts` (line 279: "replaceables deleted at end of cycle")

---

## Open Questions

1. **TTL for cache:** Is 5 minutes (300 seconds) appropriate, or should it be longer?

2. **Invoice items:** When creating the Autumn invoice via `upsertAutumnInvoice`, should we populate the `items` array (by calling `getInvoiceItems()`), or leave it empty?

3. **Entity ID logic:** If customer products span multiple entities, what should `internal_entity_id` be? Current plan: only set if ALL customer products have the same entity.

4. **Test migration:** Should we migrate existing tests from `/tests/attach/prepaid/` or create fresh tests following the new `initScenario` pattern?

---

## Dependencies

### Phase A
- `CacheManager` from `@/utils/cacheUtils/CacheManager`
- `FullCusProduct` from `@autumn/shared`

### Phase B
- `InvoiceService` from `@/internal/invoices/InvoiceService`
- `InvoiceCreatedContext` from `setupInvoiceCreatedContext`

### Phase C
- `initScenario`, `s` from `@tests/utils/testInitUtils/initScenario`
- `items`, `products` from test fixtures
- `advanceToNextInvoice` from test utilities

---

## File Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| A | `expiredCache/setExpiredCustomerProductsCache.ts`<br>`expiredCache/getExpiredCustomerProductsCache.ts`<br>`expiredCache/index.ts` | `actions/index.ts`<br>`expireAndActivateCustomerProducts.ts`<br>`setupInvoiceCreatedContext.ts` |
| B | `tasks/upsertAutumnInvoice.ts` | `handleStripeInvoiceCreated.ts` |
| C | `invoice-created-prepaid.test.ts`<br>`invoice-created-allocated.test.ts` | - |
