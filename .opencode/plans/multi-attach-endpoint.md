# Multi-Attach Endpoint Implementation Plan

## Overview
Implement a `multiAttach` billing endpoint that allows attaching multiple plans to a customer in a single request. Follows the V2 4-layer pattern (setup, compute, evaluate, execute). No transitions support (for now).

## Files to Create

### 1. `shared/api/billing/attachV2/multiAttachParamsV0.ts`
**Zod schema for the multi-attach request body.**

Schema fields:
- `customer_id: string`
- `entity_id?: string`
- `plans: [{ plan_id, customize (no free_trial), feature_quantities?, version? }]` — min 1 plan
- `free_trial: FreeTrialParamsV1Schema.nullable().optional()` — top-level only
- `invoice_mode?: InvoiceModeParamsSchema`
- `discounts?: AttachDiscountSchema[]`
- `success_url?: string`
- `checkout_session_params?: Record<string, unknown>`
- `redirect_mode: RedirectModeSchema.default("if_required")`
- `customer_data?: CustomerDataSchema` (internal)
- `entity_data?: EntityDataSchema` (internal)

Per-plan `customize` uses a custom schema with just `price` and `items` (no `free_trial`, no refinement requiring at least one field — since it's optional). Import `BasePriceParamsSchema` and `CreatePlanItemParamsV1Schema` directly.

### 2. `shared/models/billingModels/context/multiAttachBillingContext.ts`
**Type definition for multi-attach billing context.**

```typescript
import type { Entitlement, FeatureOptions, FullProduct, Price } from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext } from "./billingContext";
import type { CheckoutMode } from "./attachBillingContext";

export interface MultiAttachProductContext {
  fullProduct: FullProduct;
  customPrices: Price[];
  customEnts: Entitlement[];
  featureQuantities: FeatureOptions[];
}

export interface MultiAttachBillingContext extends BillingContext {
  productContexts: MultiAttachProductContext[];
  checkoutMode: CheckoutMode;
}
```

No transition fields.

### 3. `server/src/internal/billing/v2/actions/multiAttach/setup/setupMultiAttachCheckoutMode.ts`
**Simplified checkout mode for multi-attach.**

Logic:
```
if redirect_mode === "never" → null
if has payment method AND redirect_mode === "always" → "stripe_checkout"
if has payment method AND redirect_mode === "if_required" → null
if no payment method → "stripe_checkout"
```

No `"autumn_checkout"` cases.

### 4. `server/src/internal/billing/v2/actions/multiAttach/setup/setupMultiAttachTrialContext.ts`
**Simplified trial context — only uses top-level free_trial param.**

If `free_trial` param provided → call `handleFreeTrialParam` with it (use first product for paid/recurring check).
If not → return `undefined`.

### 5. `server/src/internal/billing/v2/actions/multiAttach/setup/setupMultiAttachBillingContext.ts`
**Full billing context assembly.**

Steps:
1. `setupFullCustomerContext` — single call
2. `Promise.all` over plans → for each: `setupAttachProductContext` (pass plan_id, customize, version) + `setupFeatureQuantitiesContext`
3. Single `setupStripeBillingContext` (no `targetCustomerProduct`, no forced new subscription)
4. `setupMultiAttachTrialContext` — top-level free_trial only
5. `setupBillingCycleAnchor`, `setupResetCycleAnchor` (no currentCustomerProduct)
6. `setupMultiAttachCheckoutMode`
7. `setupInvoiceModeContext`
8. `setupTransitionConfigs` (pass empty-ish params since no transitions)
9. Assemble and return `MultiAttachBillingContext`

For `setupAttachProductContext`, each plan item is mapped to `AttachParamsV1` shape:
```typescript
{ plan_id: plan.plan_id, customize: plan.customize, version: plan.version }
```

For `setupFeatureQuantitiesContext`, each plan's feature_quantities are resolved against its product.

### 6. `server/src/internal/billing/v2/actions/multiAttach/compute/computeMultiAttachPlan.ts`
**Compute billing plan for all products.**

For each product context, construct a temporary `AttachBillingContext` (spreading from the multi-attach context + per-plan fields):
- `attachProduct: productContext.fullProduct`
- `currentCustomerProduct: undefined`
- `scheduledCustomerProduct: undefined`
- `planTiming: "immediate"`
- `endOfCycleMs: undefined`
- `checkoutMode: multiAttachContext.checkoutMode`
- `featureQuantities: productContext.featureQuantities`
- `customPrices: productContext.customPrices`
- `customEnts: productContext.customEnts`

Call `computeAttachNewCustomerProduct` with each temporary context to get all new customer products.

Then call `buildAutumnLineItems` once with:
- `newCustomerProducts: [all new products]`
- `deletedCustomerProduct: undefined`
- `includeArrearLineItems: false`

Build `AutumnBillingPlan`:
- `insertCustomerProducts: [all new customer products]`
- `updateCustomerProduct: undefined`
- `deleteCustomerProduct: undefined`
- `customPrices: merged from all plans`
- `customEntitlements: merged from all plans`
- `customFreeTrial: trialContext?.customFreeTrial`
- `lineItems, updateCustomerEntitlements` from buildAutumnLineItems

Apply `finalizeLineItems` to handle trial line item filtering.

### 7. `server/src/internal/billing/v2/actions/multiAttach/multiAttach.ts`
**Main orchestrator.**

```typescript
export async function multiAttach({ ctx, params }) {
  // 1. Setup
  const billingContext = await setupMultiAttachBillingContext({ ctx, params });

  // 2. Compute
  const autumnBillingPlan = computeMultiAttachPlan({ ctx, multiAttachBillingContext: billingContext });

  // 3. Evaluate (reuse existing function)
  const stripeBillingPlan = await evaluateStripeBillingPlan({
    ctx,
    billingContext,
    autumnBillingPlan,
    checkoutMode: billingContext.checkoutMode,
  });

  const billingPlan = { autumn: autumnBillingPlan, stripe: stripeBillingPlan };

  // 4. Execute (reuse existing function)
  const billingResult = await executeBillingPlan({ ctx, billingContext, billingPlan });

  return { billingContext, billingPlan, billingResult };
}
```

No autumn_checkout. No preview support initially.

### 8. `server/src/internal/billing/v2/handlers/handleMultiAttach.ts`
**Hono handler.**

Uses `createRoute` with:
- `versionedBody: { latest: MultiAttachParamsV0Schema }`
- `resource: AffectedResource.MultiAttach`
- Lock: `lock:multi_attach:{orgId}:{env}:{customerId}` with 120s TTL
- Handler calls `billingActions.multiAttach()`, then `billingResultToResponse()`

## Files to Modify

### 9. `shared/api/billing/index.ts`
Add: `export * from "./attachV2/multiAttachParamsV0";`

### 10. `shared/models/billingModels/` barrel exports
Export `MultiAttachBillingContext` and `MultiAttachProductContext` from the appropriate index file.

### 11. `shared/api/versionUtils/versionChangeUtils/VersionChange.ts`
Add `MultiAttach = "multi_attach"` to `AffectedResource` enum.

### 12. `server/src/internal/billing/v2/actions/index.ts`
Add `multiAttach` to `billingActions` object:
```typescript
import { multiAttach } from "./multiAttach/multiAttach";
export const billingActions = {
  attach,
  multiAttach,
  updateSubscription,
  migrate,
  legacy: { ... },
};
```

### 13. `server/src/internal/billing/billingRouter.ts`
Add route:
```typescript
import { handleMultiAttach } from "./v2/handlers/handleMultiAttach.js";
billingRpcRouter.post("/billing.multi_attach", ...handleMultiAttach);
```

## Implementation Order
1. Shared types (schema + context type + exports + AffectedResource)
2. Server setup functions (checkout mode, trial, billing context)
3. Server compute function
4. Server orchestrator
5. Handler + route registration
6. Lint check
