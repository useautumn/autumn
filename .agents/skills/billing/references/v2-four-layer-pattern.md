# V2 Billing: Four-Layer Pattern Deep Dive

The V2 billing architecture separates concerns into four distinct layers. Each layer has a single responsibility, making the code easier to test, debug, and extend.

## Overview

```
Request
    ↓
┌─────────────────────────────────────────────────────────────┐
│  1. SETUP LAYER                                             │
│     Fetch all data needed for billing operation             │
│     Output: BillingContext                                  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  2. COMPUTE LAYER                                           │
│     Determine what Autumn state changes are needed          │
│     Output: AutumnBillingPlan                               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  3. EVALUATE LAYER (UNIFIED)                                │
│     Map Autumn changes → Stripe changes                     │
│     Output: StripeBillingPlan                               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  4. EXECUTE LAYER (UNIFIED)                                 │
│     Execute Stripe actions, then Autumn DB updates          │
│     Output: BillingResult                                   │
└─────────────────────────────────────────────────────────────┘
    ↓
Response
```

## Layer 1: Setup

**Purpose**: Fetch all data needed for the billing operation. No mutations.

**Output**: `BillingContext` (or endpoint-specific extension like `UpdateSubscriptionBillingContext`)

### Key Setup Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `setupFullCustomerContext` | `setup/setupFullCustomerContext.ts` | Load customer with products, entitlements |
| `setupStripeBillingContext` | `providers/stripe/setup/setupStripeBillingContext.ts` | Load Stripe subscription, customer, payment method |
| `setupTrialContext` | `setup/setupTrialContext.ts` | Determine trial state and end date |
| `setupBillingCycleAnchor` | `setup/setupBillingCycleAnchor.ts` | Determine billing cycle anchor |
| `setupFeatureQuantitiesContext` | `setup/setupFeatureQuantitiesContext.ts` | Parse feature quantity params |

### BillingContext Type

```typescript
// From: billingContext.ts

interface BillingContext {
  // Customer data
  fullCustomer: FullCustomer;
  fullProducts: FullProduct[];
  
  // Stripe state
  stripeCustomer: Stripe.Customer;
  stripeSubscription?: Stripe.Subscription;
  stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
  stripeDiscounts?: StripeDiscountWithCoupon[];
  paymentMethod?: Stripe.PaymentMethod;
  
  // Timestamps
  currentEpochMs: number;
  billingCycleAnchorMs: number | "now";
  resetCycleAnchorMs: number | "now";
  
  // Options
  featureQuantities: FeatureOptions[];
  invoiceMode?: InvoiceMode;
  
  // Custom items (determined in setup)
  customPrices: Price[];
  customEnts: Entitlement[];
  
  // Trial
  trialContext?: TrialContext;
  isCustom: boolean;
}

// Endpoint-specific extension
interface UpdateSubscriptionBillingContext extends BillingContext {
  customerProduct: FullCusProduct; // Target customer product being updated
}
```

### Example: Update Subscription Setup

```typescript
// From: updateSubscription/setup/setupUpdateSubscriptionBillingContext.ts

export const setupUpdateSubscriptionBillingContext = async ({
  ctx,
  params,
}: {
  ctx: AutumnContext;
  params: UpdateSubscriptionV0Params;
}): Promise<UpdateSubscriptionBillingContext> => {
  // 1. Load customer
  const fullCustomer = await setupFullCustomerContext({ ctx, params });

  // 2. Load product context
  const { customerProduct, fullProduct, customPrices, customEnts } =
    await setupUpdateSubscriptionProductContext({ ctx, fullCustomer, params });

  // 3. Parse feature quantities
  const featureQuantities = setupFeatureQuantitiesContext({
    ctx,
    featureQuantitiesParams: params,
    fullProduct,
    currentCustomerProduct: customerProduct,
  });

  // 4. Load Stripe context
  const { stripeSubscription, stripeCustomer, ... } = 
    await setupStripeBillingContext({
      ctx,
      fullCustomer,
      targetCustomerProduct: customerProduct,
    });

  // 5. Setup trial context
  const trialContext = setupTrialContext({
    stripeSubscription,
    customerProduct,
    currentEpochMs,
    params,
    fullProduct,
  });

  // 6. Setup billing cycle anchor
  const billingCycleAnchorMs = setupBillingCycleAnchor({ ... });

  return {
    fullCustomer,
    fullProducts: [fullProduct],
    customerProduct,
    stripeSubscription,
    stripeCustomer,
    // ... all context fields
  };
};
```

## Layer 2: Compute

**Purpose**: Determine what Autumn state changes are needed. No Stripe API calls.

**Output**: `AutumnBillingPlan`

### AutumnBillingPlan Type

```typescript
// From: types/autumnBillingPlan.ts

interface AutumnBillingPlan {
  // Customer products to insert (new subscriptions)
  insertCustomerProducts: FullCusProduct[];
  
  // Customer product to update (existing subscription)
  updateCustomerProduct: {
    customerProduct: FullCusProduct;
    updates: {
      options?: FeatureOptions[];
      status?: CusProductStatus;
    };
  };
  
  // Customer product to delete (when replacing)
  deleteCustomerProduct?: FullCusProduct;
  
  // Custom items to insert
  customPrices: Price[];
  customEntitlements: Entitlement[];
  customFreeTrial?: FreeTrial;
  
  // Line items for invoicing
  lineItems: LineItem[];
  
  // Entitlement balance changes
  updateCustomerEntitlements?: UpdateCustomerEntitlement[];
}
```

### Key Compute Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `computeUpdateSubscriptionPlan` | `updateSubscription/compute/computeUpdateSubscriptionPlan.ts` | Main compute for update subscription |
| `computeUpdateQuantityPlan` | `updateSubscription/compute/updateQuantity/computeUpdateQuantityPlan.ts` | Quantity change plan |
| `computeCustomPlan` | `updateSubscription/compute/customPlan/computeCustomPlan.ts` | Custom items plan |
| `buildAutumnLineItems` | `compute/computeAutumnUtils/buildAutumnLineItems.ts` | Build line items for invoicing |

### Example: Compute Intent Routing

```typescript
// From: updateSubscription/compute/computeUpdateSubscriptionPlan.ts

export const computeUpdateSubscriptionPlan = async ({
  ctx,
  billingContext,
  params,
}: { ... }): Promise<AutumnBillingPlan> => {
  // Determine intent from params
  const intent = computeUpdateSubscriptionIntent(params);

  let plan: AutumnBillingPlan;
  switch (intent) {
    case UpdateSubscriptionIntent.UpdateQuantity:
      plan = computeUpdateQuantityPlan({ ctx, updateSubscriptionContext: billingContext });
      break;
    case UpdateSubscriptionIntent.UpdatePlan:
      plan = await computeCustomPlan({ ctx, updateSubscriptionContext: billingContext, params });
      break;
  }

  // Finalize (filter line items, handle trial transitions)
  plan = finalizeUpdateSubscriptionPlan({ ctx, plan, billingContext });

  return plan;
};
```

## Layer 3: Evaluate (UNIFIED)

**Purpose**: Map Autumn state changes to Stripe API actions. This layer is UNIFIED across all endpoints.

**Output**: `StripeBillingPlan`

**Key principle**: ONE mapping from Autumn → Stripe. All endpoints use `evaluateStripeBillingPlan`.

### StripeBillingPlan Type

```typescript
// From: types/stripeBillingPlan/stripeBillingPlan.ts

interface StripeBillingPlan {
  subscriptionAction?: StripeSubscriptionAction;      // create/update/cancel subscription
  subscriptionScheduleAction?: StripeSubscriptionScheduleAction;  // schedule future changes
  invoiceAction?: StripeInvoiceAction;                // create manual invoice
  invoiceItemsAction?: StripeInvoiceItemsAction;      // add items to invoice
}

type StripeSubscriptionAction = 
  | { type: "create"; params: Stripe.SubscriptionCreateParams }
  | { type: "update"; stripeSubscriptionId: string; params: Stripe.SubscriptionUpdateParams }
  | { type: "cancel"; stripeSubscriptionId: string };
```

### evaluateStripeBillingPlan

```typescript
// From: providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts

export const evaluateStripeBillingPlan = async ({
  ctx,
  billingContext,
  autumnBillingPlan,
}: { ... }): Promise<StripeBillingPlan> => {
  // 1. Initialize Stripe resources (create prices if needed)
  await initStripeResourcesForBillingPlan({ ctx, autumnBillingPlan, billingContext });

  // 2. Compute final customer state
  const finalFullCustomer = autumnBillingPlanToFinalFullCustomer({
    billingContext,
    autumnBillingPlan,
  });

  // 3. Build subscription action (create/update/cancel)
  const stripeSubscriptionAction = buildStripeSubscriptionAction({
    ctx,
    billingContext,
    autumnBillingPlan,
    finalCustomerProducts: finalFullCustomer.customer_products,
  });

  // 4. Determine if we need manual invoice
  const createManualInvoice = shouldCreateManualStripeInvoice({
    billingContext,
    stripeSubscriptionAction,
  });

  // 5. Build invoice actions if needed
  let stripeInvoiceAction, stripeInvoiceItemsAction;
  if (createManualInvoice) {
    stripeInvoiceAction = buildStripeInvoiceAction({ lineItems });
    stripeInvoiceItemsAction = buildStripeInvoiceItemsAction({ lineItems, billingContext });
  }

  // 6. Build subscription schedule action (for future changes)
  const stripeSubscriptionScheduleAction = buildStripeSubscriptionScheduleAction({
    ctx,
    billingContext,
    finalCustomerProducts: finalFullCustomer.customer_products,
    trialEndsAt: billingContext.trialContext?.trialEndsAt,
  });

  return {
    subscriptionAction: stripeSubscriptionAction,
    invoiceAction: stripeInvoiceAction,
    invoiceItemsAction: stripeInvoiceItemsAction,
    subscriptionScheduleAction: stripeSubscriptionScheduleAction,
  };
};
```

## Layer 4: Execute (UNIFIED)

**Purpose**: Execute Stripe actions first, then Autumn DB updates. This layer is UNIFIED.

**Output**: `BillingResult`

### Execution Order

```
1. Execute Stripe billing plan
   a. Invoice action (create invoice)
   b. Invoice items action (add items)
   c. Subscription action (create/update/cancel)
   d. Subscription schedule action (schedule future changes)

2. If Stripe execution is deferred (waiting for payment), return early

3. Execute Autumn billing plan
   a. Insert new customer products
   b. Update customer entitlements
   c. Update customer product options
```

### executeBillingPlan

```typescript
// From: execute/executeBillingPlan.ts

export const executeBillingPlan = async ({
  ctx,
  billingContext,
  billingPlan,
}: { ... }): Promise<BillingResult> => {
  // 1. Execute Stripe operations first
  const stripeBillingResult = await executeStripeBillingPlan({
    ctx,
    billingPlan,
    billingContext,
  });

  // 2. If deferred (e.g., waiting for payment), return early
  if (stripeBillingResult.deferred) {
    return { stripe: stripeBillingResult };
  }

  // 3. Execute Autumn DB operations
  await executeAutumnBillingPlan({
    ctx,
    autumnBillingPlan: billingPlan.autumn,
  });

  return { stripe: stripeBillingResult };
};
```

## Adding a New Billing Endpoint

Follow this checklist:

### 1. Create Setup Function

```typescript
// File: billing/v2/{endpoint}/setup/setup{Endpoint}BillingContext.ts

export const setup{Endpoint}BillingContext = async ({
  ctx,
  params,
}: {
  ctx: AutumnContext;
  params: {Endpoint}Params;
}): Promise<{Endpoint}BillingContext> => {
  // Use shared setup functions
  const fullCustomer = await setupFullCustomerContext({ ctx, params });
  const { stripeSubscription, ... } = await setupStripeBillingContext({ ... });
  
  return { fullCustomer, stripeSubscription, ... };
};
```

### 2. Create Compute Function

```typescript
// File: billing/v2/{endpoint}/compute/compute{Endpoint}Plan.ts

export const compute{Endpoint}Plan = async ({
  ctx,
  billingContext,
  params,
}: { ... }): Promise<AutumnBillingPlan> => {
  // Determine what changes are needed
  return {
    insertCustomerProducts: [...],
    updateCustomerProduct: { ... },
    lineItems: [...],
    // ...
  };
};
```

### 3. Create Error Handler

```typescript
// File: billing/v2/{endpoint}/errors/handle{Endpoint}Errors.ts

export const handle{Endpoint}Errors = async ({
  ctx,
  billingContext,
  autumnBillingPlan,
  params,
}: { ... }) => {
  // Validate before execution
  if (someCondition) {
    throw new RecaseError({ message: "...", code: ErrCode.BadRequest });
  }
};
```

### 4. Wire Up Handler

```typescript
// File: billing/v2/{endpoint}/handle{Endpoint}.ts

export const handle{Endpoint} = createRoute({
  body: {Endpoint}ParamsSchema,
  handler: async (c) => {
    const ctx = c.get("ctx");
    const body = c.req.valid("json");

    // 1. Setup
    const billingContext = await setup{Endpoint}BillingContext({ ctx, params: body });

    // 2. Compute
    const autumnBillingPlan = await compute{Endpoint}Plan({ ctx, billingContext, params: body });

    // 3. Errors
    await handle{Endpoint}Errors({ ctx, billingContext, autumnBillingPlan, params: body });

    // 4. Evaluate (UNIFIED - don't modify)
    const stripeBillingPlan = await evaluateStripeBillingPlan({
      ctx,
      billingContext,
      autumnBillingPlan,
    });

    // 5. Execute (UNIFIED - don't modify)
    const billingResult = await executeBillingPlan({
      ctx,
      billingContext,
      billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
    });

    return c.json(billingResultToResponse({ billingContext, billingResult }), 200);
  },
});
```

## Key Principles

1. **Setup is read-only**: No mutations in setup layer
2. **Compute is Stripe-agnostic**: No Stripe types or API calls in compute layer
3. **Evaluate is unified**: All endpoints use `evaluateStripeBillingPlan`
4. **Execute is unified**: All endpoints use `executeBillingPlan`
5. **Stripe first, then Autumn**: Always execute Stripe before DB updates
6. **Deferred execution**: Handle cases where Stripe operation is pending (e.g., payment)
