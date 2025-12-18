# Billing V2 Composable Architecture Refactor

## Current State Analysis

The existing [`handleAttach.ts`](server/src/internal/billing/attach/handleAttach.ts) handles 16 different `AttachBranch` scenarios through a complex branching system. We're reorganizing into 4 distinct endpoints with shared infrastructure.

### Branch → Endpoint Mapping

| AttachBranch | New Endpoint |
|--------------|--------------|
| `New`, `AddOn`, `MainIsFree`, `MainIsTrial`, `Upgrade`, `Downgrade`, `Renew`, `OneOff` | **Attach V2** |
| `NewVersion`, `SameCustomEnts`, `SameCustom`, `UpdatePrepaidQuantity` | **Subscription Update** |
| `Cancel` | **Cancel** |
| `MultiProduct`, `MultiAttach`, `MultiAttachUpdate` | **Multi-Product Attach** |

---

## Phase 0: Foundation - Unified Types and Executor

**Goal**: Create the shared `BillingPlan` type and unified executor that all endpoints will use.

### 0.1 Define BillingPlan Types

Create [`server/src/internal/billing/v2/types/billingPlan.ts`](server/src/internal/billing/v2/types/billingPlan.ts):

```typescript
type BillingPlan = {
  intent: "attach" | "update_quantity" | "update_plan" | "cancel" | "one_off";
  
  stripe: {
    manualInvoice?: {
      items: Stripe.InvoiceItemCreateParams[];
      finalize: boolean;
      chargeAutomatically: boolean;
    };
    subscription?: {
      action: "create" | "update" | "cancel";
      params: SubscriptionParams;
    };
    subscriptionItemUpdates?: { itemId: string; quantity: number }[];
    checkout?: Stripe.Checkout.SessionCreateParams;
  };
  
  autumn: {
    insertCusProducts?: FullCusProduct[];
    expireCusProducts?: string[];
    updateCusProduct?: { cusProductId: string; options: FeatureOptions[] };
    entitlementChanges?: { cusEntId: string; delta: number }[];
  };
};

type ExecutionResult = {
  invoices: Stripe.Invoice[];
  subscription?: Stripe.Subscription;
  checkout?: Stripe.Checkout.Session;
};
```

### 0.2 Create Unified Executor

Create [`server/src/internal/billing/v2/execute/executeBillingPlan.ts`](server/src/internal/billing/v2/execute/executeBillingPlan.ts):

- Execute manual invoice items → finalize
- Execute subscription create/update/cancel
- Execute subscription item updates
- Execute Autumn DB changes
- Return all invoices for DB insertion

### 0.3 Tests for Foundation

- Unit test: `BillingPlan` type validation
- Unit test: `executeBillingPlan` with mock stripe client

---

## Phase 1: Subscription Update API

**Why first**: Smallest scope, isolated from attach flow, good proving ground for the architecture.

### 1.1 Fetch Context

Refactor [`fetchSubUpdateContext.ts`](server/src/internal/billing/v2/fetch/fetchSubUpdateContext.ts):

- Fetch customer, target cus product
- Fetch stripe subscription, subscription items
- Detect flow: `update_quantity` vs `update_plan`

### 1.2 Compute Plan - Update Quantity Flow

Create `computeUpdateQuantityPlan.ts`:

**Inputs**: Target cus product, old options, new options, stripe sub

**Compute**:
1. For each option change, calculate proration amount (reuse logic from [`handleQuantityUpgrade.ts`](server/src/internal/customers/attach/attachFunctions/updateQuantityFlow/handleQuantityUpgrade.ts))
2. Build `manualInvoice.items` for prorations
3. Build `subscriptionItemUpdates` for quantity changes
4. Build `autumn.updateCusProduct` with new options
5. Build `autumn.entitlementChanges` for balance adjustments

### 1.3 Compute Plan - Update Plan Flow

Create `computeUpdatePlanPlan.ts`:

**Branches covered**: `NewVersion`, `SameCustomEnts`, `SameCustom`

**Inputs**: Target cus product, new product definition

**Compute**:
1. Build new cus product (reuse [`initFullCusProduct`](server/src/internal/billing/billingUtils/initFullCusProduct/initFullCusProduct.ts))
2. Build `stripe.subscription` update params
3. Build `autumn.expireCusProducts` for old cus product
4. Build `autumn.insertCusProducts` for new cus product

### 1.4 Handler

Update [`handleApiSubscriptionUpdate.ts`](server/src/internal/billing/v2/handlers/handleApiSubscriptionUpdate.ts):

<!-- ```typescript
if (body.options?.length > 0) {
  context = await fetchUpdateQuantityContext({ ctx, body });
  plan = computeUpdateQuantityPlan({ ctx, context });
} else {
  context = await fetchUpdatePlanContext({ ctx, body });
  plan = computeUpdatePlanPlan({ ctx, context });
}
result = await executeBillingPlan({ ctx, plan });
await insertInvoicesFromResult({ ctx, result, context });
``` -->

### 1.5 Tests

**Update Quantity Tests** (migrate from [`server/tests/attach/updateQuantity/`](server/tests/attach/updateQuantity/)):
- `updateQuantity_upgrade.test.ts` - Increase prepaid quantity
- `updateQuantity_downgrade.test.ts` - Decrease prepaid quantity
- `updateQuantity_proration.test.ts` - Verify proration calculations
- `updateQuantity_entitlements.test.ts` - Verify entitlement balance changes

**Update Plan Tests** (migrate from [`server/tests/attach/updateEnts/`](server/tests/attach/updateEnts/) and [`server/tests/attach/newVersion/`](server/tests/attach/newVersion/)):
- `updatePlan_newVersion.test.ts` - Same product, new version
- `updatePlan_sameCustomEnts.test.ts` - Only entitlements changed
- `updatePlan_sameCustom.test.ts` - Custom items changed
- `updatePlan_carryUsage.test.ts` - Verify usage carries over

---

## Phase 2: Attach V2 API

**Goal**: Handle all "new product attachment" scenarios.

### 2.1 Refactor Fetch Context

Update [`fetchAttachContext.ts`](server/src/internal/billing/v2/fetch/fetchAttachContext.ts):

- Keep existing logic
- Add: Detect checkout-required scenarios
- Add: Free trial resolution
- Add: Merge subscription detection

### 2.2 Compute Plan

Update [`computeAttachPlan.ts`](server/src/internal/billing/v2/compute/computeAttachPlan.ts):

**Branches to handle**:

| Branch | Stripe Action | Autumn Action |
|--------|---------------|---------------|
| `New` | `subscription.create` | `insertCusProducts` |
| `AddOn` | `subscription.update` (add items) | `insertCusProducts` |
| `MainIsFree` | `subscription.create` | `expireCusProducts` + `insertCusProducts` |
| `MainIsTrial` | Cancel trial sub, `subscription.create` | `expireCusProducts` + `insertCusProducts` |
| `Upgrade` | `subscription.update` | `expireCusProducts` + `insertCusProducts` |
| `Downgrade` | Create schedule | `insertCusProducts` (scheduled) |
| `Renew` | Uncancel subscription | Update cus product |
| `OneOff` | `manualInvoice` | `insertCusProducts` |

**Key computation functions**:
- `buildStripeSubscriptionAction()` - Decide create vs update
- `buildStripeCheckoutAction()` - When checkout is required
- `buildAutumnCusProductActions()` - What to expire/insert

### 2.3 Handle Downgrade Scheduling

Create `computeDowngradePlan.ts`:

- Build subscription schedule params
- Build scheduled cus product
- Handle existing schedule updates

### 2.4 Handle Checkout Redirect

Update [`executeStripeCheckoutAction.ts`](server/src/internal/billing/v2/execute/executeStripeCheckoutAction.ts):

- Return early with checkout URL when required
- Handle `force_checkout`, `no_payment_method`, `public_api` scenarios

### 2.5 Tests

**Basic Attach** (from [`server/tests/attach/basic/`](server/tests/attach/basic/)):
- `attach_new.test.ts` - New customer, new product
- `attach_free.test.ts` - Free product attachment
- `attach_trial.test.ts` - Product with free trial

**Upgrade** (from [`server/tests/attach/upgrade/`](server/tests/attach/upgrade/)):
- `attach_upgrade_sameInterval.test.ts`
- `attach_upgrade_diffInterval.test.ts`
- `attach_upgrade_fromFree.test.ts`
- `attach_upgrade_fromTrial.test.ts`
- `attach_upgrade_proration.test.ts`

**Downgrade** (from [`server/tests/attach/downgrade/`](server/tests/attach/downgrade/)):
- `attach_downgrade_schedule.test.ts`
- `attach_downgrade_existingSchedule.test.ts`
- `attach_downgrade_toFree.test.ts`
- `attach_downgrade_cancelImmediate.test.ts`

**Add-on** (from [`server/tests/attach/addOn/`](server/tests/attach/addOn/)):
- `attach_addon_new.test.ts`
- `attach_addon_withMain.test.ts`

**Checkout** (from [`server/tests/attach/checkout/`](server/tests/attach/checkout/)):
- `attach_checkout_noPaymentMethod.test.ts`
- `attach_checkout_forceCheckout.test.ts`
- `attach_checkout_invoiceOnly.test.ts`

**One-off**:
- `attach_oneoff.test.ts`

**Renew/Uncancel**:
- `attach_renew.test.ts`

**Entity** (from [`server/tests/attach/entities/`](server/tests/attach/entities/)):
- `attach_entity.test.ts`

---

## Phase 3: Cancel API

**Goal**: Clean cancel endpoint using the composable architecture.

### 3.1 Fetch Context

Create `fetchCancelContext.ts`:

- Fetch customer, target cus product
- Fetch stripe subscription
- Detect: Has scheduled product? Has default product?

### 3.2 Compute Plan

Create `computeCancelPlan.ts`:

**Cancel Immediately**:
```typescript
{
  intent: "cancel",
  stripe: {
    subscription: { action: "cancel", params: { invoice_now: prorate } }
  },
  autumn: {
    expireCusProducts: [cusProductId]
  }
}
```

**Cancel at End of Cycle** (schedule downgrade):
- Reuse downgrade scheduling logic
- If default product exists, schedule transition to it

### 3.3 Handler

Create [`handleCancelV2.ts`](server/src/internal/billing/v2/handlers/handleCancelV2.ts):

```typescript
const context = await fetchCancelContext({ ctx, body });
const plan = computeCancelPlan({ ctx, context });
await executeBillingPlan({ ctx, plan });
```

### 3.4 Tests

From existing cancel tests and [`server/tests/attach/downgrade/`](server/tests/attach/downgrade/):
- `cancel_immediately.test.ts`
- `cancel_endOfCycle.test.ts`
- `cancel_withScheduledProduct.test.ts`
- `cancel_toDefaultProduct.test.ts`
- `cancel_proration.test.ts`
- `cancel_addon.test.ts`

---

## Phase 4: Multi-Product Attach API

**Goal**: New endpoint for attaching multiple products at once.

### 4.1 Design

- Validate: All products must be compatible (no conflicting intervals, no upgrade/downgrade scenarios)
- Build multiple cus products
- Create single subscription with all items

### 4.2 Implementation

Create `handleMultiProductAttach.ts`:

```typescript
const context = await fetchMultiProductContext({ ctx, body });
const plan = computeMultiProductPlan({ ctx, context });
await executeBillingPlan({ ctx, plan });
```

### 4.3 Tests

From [`server/tests/attach/multiProduct/`](server/tests/attach/multiProduct/):
- `multiProduct_basic.test.ts`
- `multiProduct_withAddons.test.ts`
- `multiProduct_validation.test.ts`

---

## Phase 5: Integration and Migration

### 5.1 Feature Flag Rollout

- Add feature flag to route between old and new endpoints
- Gradual rollout with monitoring

### 5.2 Deprecate Old Code

- Mark old `handleAttach.ts` as deprecated
- Remove old flow handlers after validation period

### 5.3 Final Test Suite

- Full regression test against old behavior
- Performance benchmarks

---

## Edge Cases Checklist

From analyzing the existing code, ensure these are all covered:

**Customer State**:
- [ ] Customer with no processor ID
- [ ] Customer with test clock
- [ ] Customer with existing payment method
- [ ] Customer with no payment method
- [ ] Entity-scoped products

**Subscription State**:
- [ ] No existing subscription
- [ ] Existing subscription (merge)
- [ ] Canceled subscription (renew)
- [ ] Subscription with schedule
- [ ] Trialing subscription
- [ ] Past-due subscription

**Product State**:
- [ ] Free product
- [ ] Paid product
- [ ] Add-on product
- [ ] Product with free trial
- [ ] Product with prepaid features
- [ ] Custom items override
- [ ] New version of same product

**Billing**:
- [ ] Proration immediately
- [ ] Proration at next billing
- [ ] No proration
- [ ] Invoice only mode
- [ ] Checkout mode
- [ ] Anchor to start of month

**Scheduling**:
- [ ] Downgrade creates new schedule
- [ ] Downgrade updates existing schedule
- [ ] Cancel scheduled product

---

## File Structure After Refactor

```
server/src/internal/billing/v2/
├── types/
│   ├── billingPlan.ts          # BillingPlan, ExecutionResult
│   ├── attachContext.ts        # AttachContext type
│   ├── cancelContext.ts        # CancelContext type
│   └── subUpdateContext.ts     # SubUpdateContext type
├── fetch/
│   ├── fetchAttachContext.ts
│   ├── fetchCancelContext.ts
│   ├── fetchSubUpdateContext.ts
│   └── fetchMultiProductContext.ts
├── compute/
│   ├── computeAttachPlan.ts
│   ├── computeCancelPlan.ts
│   ├── computeUpdateQuantityPlan.ts
│   ├── computeUpdatePlanPlan.ts
│   └── computeMultiProductPlan.ts
├── execute/
│   ├── executeBillingPlan.ts   # Unified executor
│   └── executeUtils/
│       ├── executeManualInvoice.ts
│       ├── executeSubscription.ts
│       └── executeAutumnChanges.ts
└── handlers/
    ├── handleAttachV2.ts
    ├── handleCancelV2.ts
    ├── handleApiSubscriptionUpdate.ts
    └── handleMultiProductAttach.ts
```

---

## Progress Tracking

- [ ] **Phase 0**: Foundation - Unified Types and Executor
- [ ] **Phase 1**: Subscription Update API (update quantity + update plan)
- [ ] **Phase 2**: Attach V2 API
- [ ] **Phase 3**: Cancel V2 API
- [ ] **Phase 4**: Multi-Product Attach API
- [ ] **Phase 5**: Integration and Migration

