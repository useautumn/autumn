# Billing Key Implementation Plan

## Overview

Add a `billing_key` field to customer products that allows users to:
1. **Tag** customer products with a unique key at attach time
2. **Target** specific customer products in updateSubscription (and future operations) by billing_key
3. **View** billing_key on each subscription/purchase in the API response

Additionally:
- Make `plan_id` truly optional in updateSubscription, with smart auto-resolution of the target customer product
- Stop merging subscriptions in V2.1 API responses (each customer product = its own entry)
- Apply the existing merge logic as a backwards-compatibility transform for V2.0 and older

---

## Phase 1: Schema & Database Changes

### 1A. Add `billing_key` column to Drizzle table
**File:** `shared/models/cusProductModels/cusProductTable.ts`

- Add `billing_key: text("billing_key")` column to the `customerProducts` table definition
- No database-level unique constraint (enforce at application level for flexibility)

### 1B. Add `billing_key` to CusProduct Zod schema
**File:** `shared/models/cusProductModels/cusProductModels.ts`

- Add `billing_key: z.string().nullish()` to `CusProductSchema`
- This propagates to `FullCusProductSchema` automatically

### 1C. Generate database migration
- Run `bun drizzle-kit generate` from `shared/` to create the migration SQL for the new column

---

## Phase 2: API Input Params - Add `billing_key` to Attach/UpdateSubscription

### 2A. V1 params (new billing endpoints)

**File:** `shared/api/billing/common/billingParamsBase/billingParamsBaseV1.ts`
- Add `billing_key: z.string().optional()` to `BillingParamsBaseV1Schema`
- This automatically propagates to `AttachParamsV1Schema`, `UpdateSubscriptionV1ParamsSchema`, and `ExtUpdateSubscriptionV1ParamsSchema`

### 2B. V0 params (legacy billing endpoints)

**File:** `shared/api/billing/common/billingParamsBase/billingParamsBaseV0.ts`
- Add `billing_key: z.string().optional()` to `BillingParamsBaseV0Schema`
- This propagates to `AttachParamsV0Schema`, `ExtAttachParamsV0Schema`, `UpdateSubscriptionV0ParamsSchema`, `ExtUpdateSubscriptionV0ParamsSchema`

### 2C. MultiAttach plan-level `billing_key`
**File:** `shared/api/billing/attachV2/multiAttachParamsV0.ts`
- Add `billing_key: z.string().optional()` to `MultiAttachPlanSchema` (per-plan level)
- This allows each plan in a multi-attach to have its own billing_key

### 2D. V0→V1 param transforms
**File:** `shared/api/billing/attachV2/requestChanges/V1.2_AttachParamsChange.ts`
- Pass `billing_key` through in the `transformRequest` from V0→V1 (it already spreads `...input`, so it should pass through. Verify this works since `billing_key` is in the base schema for both V0 and V1)

**File:** `shared/api/billing/updateSubscription/requestChanges/V1.2_UpdateSubscriptionParamsChange.ts`
- Same: verify `billing_key` passes through via `...input` spread

---

## Phase 3: Flow `billing_key` Through Attach & MultiAttach

### 3A. Add `billing_key` to `InitFullCustomerProductOptions`
**File:** `shared/models/billingModels/customerProduct/initFullCustomerProductContext.ts`
- Add `billingKey?: string` to `InitFullCustomerProductOptions`

### 3B. Set `billing_key` in `initCustomerProduct`
**File:** `server/src/internal/billing/v2/utils/initFullCustomerProduct/initCustomerProduct.ts`
- Destructure `billingKey` from `initOptions`
- Add `billing_key: billingKey ?? null` to the returned `CusProduct` object

### 3C. Pass `billing_key` from attach compute to init
**File:** `server/src/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.ts`
- The `billing_key` needs to flow from `params` through `billingContext` to `initOptions`
- Option: Store `billing_key` on the `AttachBillingContext` interface

**File:** `shared/models/billingModels/context/attachBillingContext.ts`
- Add `billingKey?: string` to `AttachBillingContext`

**File:** `server/src/internal/billing/v2/actions/attach/setup/setupAttachBillingContext.ts`
- Set `billingKey: params.billing_key` on the returned context

**File:** `server/src/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.ts`
- Pass `billingKey: attachBillingContext.billingKey` in `initOptions`

### 3D. Pass `billing_key` through multi-attach
**File:** `shared/models/billingModels/context/multiAttachBillingContext.ts`
- Add `billingKey?: string` to `MultiAttachProductContext`

**File:** `server/src/internal/billing/v2/actions/multiAttach/setup/setupMultiAttachBillingContext.ts`
- When iterating over `params.plans`, pass each plan's `billing_key` into the `MultiAttachProductContext`

**File:** `server/src/internal/billing/v2/actions/multiAttach/compute/computeMultiAttachPlan.ts` (and wherever the per-product `initFullCustomerProduct` is called for multi-attach)
- Pass `billingKey` through to `initOptions` for each product context

### 3E. Uniqueness validation for `billing_key`
- **Where:** In `setupAttachBillingContext` (and `setupMultiAttachBillingContext`) after loading the full customer
- **Logic:** Query `fullCustomer.customer_products` to check if any existing customer product for this `internal_customer_id` (regardless of entity) already has the same `billing_key`
- **Error:** Throw `RecaseError` with code `duplicate_billing_key` if a duplicate is found
- **Also check:** Within the multi-attach plans array itself (no two plans in the same request can have the same billing_key)

---

## Phase 4: `billing_key` in UpdateSubscription Targeting

### 4A. Make `plan_id` explicitly optional in Ext schemas
**File:** `shared/api/billing/updateSubscription/updateSubscriptionV1Params.ts`
- Move `plan_id: z.string().optional()` from `UpdateSubscriptionV1ParamsSchema` up to `ExtUpdateSubscriptionV1ParamsSchema` (it's already optional in the inner schema, but this makes it visible at the Ext level)

**File:** `shared/api/billing/updateSubscription/updateSubscriptionV0Params.ts`
- `product_id` is already `z.string().nullish()` in `ExtUpdateSubscriptionV0ParamsSchema` — good, no change needed

### 4B. Add `billing_key` to `UpdateSubscriptionV1ParamsSchema`
- `billing_key` already flows from `BillingParamsBaseV1Schema` (Phase 2A), so it's available
- In `UpdateSubscriptionV1ParamsSchema`, `billing_key` is available alongside `plan_id` and `customer_product_id` as targeting filters

### 4C. Rewrite `findTargetCustomerProduct`
**File:** `server/src/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct.ts`

New logic:

```
1. Filter by entity scope first (all candidates must match the entity_id / customer scope)
2. If customer_product_id is provided → find by ID (highest priority)
3. If billing_key is provided → find by billing_key (+ entity scope)
4. If plan_id is provided → find by product.id === plan_id (+ entity scope)
5. If NONE of the above filters are provided → auto-resolve:
   a. Determine intent:
      - If cancel_action is set (cancel/uncancel) OR customize is set (custom plan) → "plan-level" intent
      - If feature_quantities is set → "update-quantity" intent
   b. Sort customer_products by priority:
      i.   Paid recurring main products
      ii.  Free recurring main products  
      iii. Recurring add-ons
      iv.  One-off products
      Within each tier: sort by created_at descending (most recent first)
   c. For "update-quantity" intent: additionally filter to only customer products that have ALL feature IDs from feature_quantities as prepaid features on the customer product
   d. Return first match
```

Import helpers from `classifyCustomerProduct.ts`: `isCustomerProductMain`, `isCustomerProductAddOn`, `isCustomerProductPaidRecurring`, `isCustomerProductRecurring`, `isCustomerProductOneOff`, `isCusProductOnEntity`

---

## Phase 5: API Response - Add `billing_key` and Stop Merging

### 5A. Add `billing_key` to `ApiSubscriptionV1Schema`
**File:** `shared/api/customers/cusPlans/apiSubscriptionV1.ts`
- Add `billing_key: z.string().nullable()` to `ApiSubscriptionV1Schema`
- Add `billing_key: z.string().nullable()` to `ApiPurchaseV0Schema`

### 5B. Set `billing_key` in `getApiSubscription`
**File:** `server/src/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscription.ts`
- Add `billing_key: cusProduct.billing_key ?? null` to the constructed `ApiSubscriptionV1` object

### 5C. Stop merging subscriptions in V2.1
**File:** `server/src/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscriptions.ts`
- Remove the `mergeSubscriptionsResponses` call for subscriptions and purchases
- Return `apiSubs` directly instead of `merged`
- Return `apiPurchasesAsSubscriptions` mapped to purchases directly instead of `mergedPurchasesAsSubscriptions`

### 5D. Move merge logic to shared utility
- Extract `mergeSubscriptionsResponses` into a shared utility that can be used by both `V2.0_CustomerChange` and `V2.0_EntityChange`
- Good location: `shared/api/customers/cusPlans/mergeSubscriptionResponses.ts` or similar

### 5E. Apply merge logic as backward-compat transform in `V2.0_CustomerChange`
**File:** `shared/api/customers/changes/V2.0_CustomerChange.ts`
- In the `transformResponse`, before splitting into active/scheduled, apply the merge logic
- This means V2.0 and older API versions will see merged subscriptions (same as current behavior)

### 5F. Apply merge logic in `V2.0_EntityChange`
**File:** `shared/api/entities/changes/V2.0_EntityChange.ts`
- Same as above — apply merge before splitting

### 5G. Handle `billing_key` in backward transforms
**File:** `shared/api/customers/cusPlans/changes/V2.0_ApiSubscriptionChange.ts`
- Strip `billing_key` from the V0 `ApiSubscription` response (it doesn't exist in V0 schema)
- The existing `transformApiSubscriptionV1ToV0` function needs to explicitly omit `billing_key`

### 5H. Strip `billing_key` in V1.2 change
**File:** `shared/api/customers/cusPlans/changes/V1.2_CusPlanChange.ts`
- When transforming from `ApiSubscriptionV1` to `ApiCusProductV3`, ensure `billing_key` is not passed through (it doesn't exist in the V3 products format)

---

## Phase 6: Tests

### 6A. Attach with billing_key
**Dir:** `server/tests/integration/billing/attach/billing-key/`

Tests:
1. **attach-billing-key.test.ts** - Attach a plan with `billing_key`, verify the customer response (using autumnV2_1) includes `billing_key` on the subscription
2. **attach-billing-key-entity.test.ts** - Attach at entity level with `billing_key`, verify entity response includes it
3. Modify `expectCustomerProductCorrect.ts` to accept optional `expectedBillingKey` param and verify it matches

### 6B. Multi-attach with billing_key
**Dir:** `server/tests/integration/billing/multi-attach/billing-key/`

Tests:
1. **multi-attach-billing-key.test.ts** - Multi-attach same add-on twice with different billing_keys. Get customer (V2.1), verify two separate subscription entries each with their unique billing_key

### 6C. Duplicate billing_key prevention
**Dir:** `server/tests/integration/billing/attach/billing-key/`

Tests:
1. **duplicate-billing-key.test.ts** - Attach with billing_key "key-1", then try to attach again with "key-1" → expect error. Also test within multi-attach: two plans with same billing_key → expect error

### 6D. UpdateSubscription targeting without plan_id
**Dir:** `server/tests/integration/billing/update-subscription/billing-key/`

Tests:
1. **update-no-filter.test.ts** - Attach main + add-ons, call updateSubscription with cancel_action but no plan_id/billing_key/customer_product_id → verify correct target (paid recurring main prioritized)
2. **update-quantity-no-filter.test.ts** - Attach main + add-on (add-on has prepaid feature), call updateSubscription with feature_quantities but no plan_id → verify add-on with matching feature is targeted
3. **update-with-billing-key.test.ts** - Multi-attach same add-on twice with diff billing_keys, then updateSubscription with billing_key → verify correct customer product is updated (test with cancel/custom plan/update quantity)

### 6E. Old API version backward compat
**Dir:** `server/tests/integration/billing/attach/billing-key/`

Tests:
1. **old-version-merged-subs.test.ts** - Attach same add-on twice (with different billing_keys via multi-attach), get customer using autumnV1/autumnV2 (old versions) → verify subscriptions are merged (quantity summed, no billing_key field). Get customer using autumnV2_1 → verify unmerged with billing_keys visible

### 6F. Additional suggested tests
- Attach with billing_key, then updateSubscription targeting by billing_key with feature_quantities → verify correct product updated
- Attach main product (no billing_key), cancel via updateSubscription without plan_id → verify main is auto-targeted
- Entity-scoped: attach on entity A and entity B, updateSubscription with entity_id for entity A but no plan_id → verify only entity A's product is targeted
- Auto-resolve with mixed product types: attach paid main + free add-on + one-off, cancel without plan_id → verify paid main is targeted first

---

## Implementation Order

1. **Phase 1** (Schema + DB) — foundation, everything depends on this
2. **Phase 2** (API Input Params) — define what users can send
3. **Phase 3** (Attach + MultiAttach flow) — wire billing_key through creation
4. **Phase 4** (UpdateSubscription targeting) — wire billing_key through targeting + auto-resolve
5. **Phase 5** (API Response + Unmerge) — expose billing_key + stop merging
6. **Phase 6** (Tests) — verify everything works

---

## File Change Summary

### Shared (schema/types)
| File | Change |
|------|--------|
| `shared/models/cusProductModels/cusProductTable.ts` | Add `billing_key` column |
| `shared/models/cusProductModels/cusProductModels.ts` | Add `billing_key` to CusProductSchema |
| `shared/models/billingModels/customerProduct/initFullCustomerProductContext.ts` | Add `billingKey` to InitFullCustomerProductOptions |
| `shared/models/billingModels/context/attachBillingContext.ts` | Add `billingKey` to AttachBillingContext |
| `shared/models/billingModels/context/multiAttachBillingContext.ts` | Add `billingKey` to MultiAttachProductContext |
| `shared/api/billing/common/billingParamsBase/billingParamsBaseV0.ts` | Add `billing_key` |
| `shared/api/billing/common/billingParamsBase/billingParamsBaseV1.ts` | Add `billing_key` |
| `shared/api/billing/attachV2/multiAttachParamsV0.ts` | Add `billing_key` to MultiAttachPlanSchema |
| `shared/api/billing/updateSubscription/updateSubscriptionV1Params.ts` | Move plan_id optional to Ext schema |
| `shared/api/customers/cusPlans/apiSubscriptionV1.ts` | Add `billing_key` to ApiSubscriptionV1Schema and ApiPurchaseV0Schema |
| `shared/api/customers/cusPlans/changes/V2.0_ApiSubscriptionChange.ts` | Strip `billing_key` in V1→V0 transform |
| `shared/api/customers/changes/V2.0_CustomerChange.ts` | Add merge logic before splitting subs |
| `shared/api/entities/changes/V2.0_EntityChange.ts` | Add merge logic before splitting subs |
| `shared/api/customers/cusPlans/mergeSubscriptionResponses.ts` | **NEW** — extracted merge utility |

### Server (logic)
| File | Change |
|------|--------|
| `server/src/internal/billing/v2/utils/initFullCustomerProduct/initCustomerProduct.ts` | Set `billing_key` from initOptions |
| `server/src/internal/billing/v2/actions/attach/setup/setupAttachBillingContext.ts` | Pass `billing_key` + uniqueness check |
| `server/src/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.ts` | Pass `billingKey` to initOptions |
| `server/src/internal/billing/v2/actions/multiAttach/setup/setupMultiAttachBillingContext.ts` | Pass `billing_key` per plan + uniqueness check |
| `server/src/internal/billing/v2/actions/multiAttach/compute/computeMultiAttachPlan.ts` | Pass `billingKey` per product |
| `server/src/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct.ts` | Full rewrite with priority-based auto-resolution |
| `server/src/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscription.ts` | Add `billing_key` to response |
| `server/src/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscriptions.ts` | Remove merge, return raw arrays |

### Tests (new)
| File | Description |
|------|-------------|
| `server/tests/integration/billing/attach/billing-key/attach-billing-key.test.ts` | Attach + verify billing_key |
| `server/tests/integration/billing/attach/billing-key/attach-billing-key-entity.test.ts` | Entity-level billing_key |
| `server/tests/integration/billing/attach/billing-key/duplicate-billing-key.test.ts` | Duplicate prevention |
| `server/tests/integration/billing/attach/billing-key/old-version-merged-subs.test.ts` | Backward compat merge test |
| `server/tests/integration/billing/multi-attach/billing-key/multi-attach-billing-key.test.ts` | Multi-attach with billing_keys |
| `server/tests/integration/billing/update-subscription/billing-key/update-with-billing-key.test.ts` | Update targeting by billing_key |
| `server/tests/integration/billing/update-subscription/billing-key/update-no-filter.test.ts` | Auto-resolve target |
| `server/tests/integration/billing/update-subscription/billing-key/update-quantity-no-filter.test.ts` | Feature-quantity targeting |

### Tests (modified)
| File | Change |
|------|--------|
| `server/tests/integration/billing/utils/expectCustomerProductCorrect.ts` | Add optional `expectedBillingKey` param |
