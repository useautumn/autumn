# Billing V2 Folder Structure

```
server/src/internal/billing/v2/
│
├── _types/                          # Shared types
│   ├── billingContext.ts            # BillingContext (shared base)
│   ├── billingPlan.ts               # BillingPlan, ExecutionResult
│   └── index.ts                     # Re-exports
│
├── _shared/                         # Shared helpers (used by multiple flows)
│   │
│   ├── fetch/                       # Shared fetch helpers
│   │   ├── fetchStripeCustomer.ts
│   │   ├── fetchStripeSub.ts
│   │   ├── fetchPaymentMethod.ts
│   │   └── index.ts
│   │
│   ├── compute/                     # Shared compute helpers (server-side)
│   │   │
│   │   ├── cusProduct/              # CusProduct initialization
│   │   │   ├── initFullCusProduct.ts
│   │   │   ├── initCusProduct.ts
│   │   │   ├── initCusPrice.ts
│   │   │   ├── initCusEntitlement/
│   │   │   │   ├── initCusEntitlement.ts
│   │   │   │   ├── initCusEntitlementBalance.ts
│   │   │   │   ├── initCusEntitlementEntities.ts
│   │   │   │   ├── initCusEntitlementNextResetAt.ts
│   │   │   │   └── initCusEntUsageAllowed.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── existingState/           # Handle existing usages/rollovers
│   │   │   ├── applyExistingUsages.ts
│   │   │   ├── cusProductToExistingUsages.ts
│   │   │   ├── applyExistingRollovers.ts
│   │   │   ├── cusProductToExistingRollovers.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── stripeAdapter/                  # Stripe-specific transformations
│   │   │   │                        # (migrated from billingUtils/stripeAdapter/)
│   │   │   │
│   │   │   ├── subItems/            # Build Stripe sub items
│   │   │   │   ├── cusProductToStripeItemSpecs.ts  # FullCusProduct → StripeItemSpec[]
│   │   │   │   ├── buildSubItemUpdate.ts           # Build params for si.update()
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── invoice/             # Invoice operations
│   │   │   │   ├── lineItemsToStripeLines.ts
│   │   │   │   ├── createAndPayInvoice.ts
│   │   │   │   ├── payStripeInvoice.ts
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── discounts/           # Discount application
│   │   │   │   ├── subToDiscounts.ts
│   │   │   │   ├── discountAppliesToLineItem.ts
│   │   │   │   ├── applyStripeDiscountsToLineItems.ts
│   │   │   │   ├── applyAmountOffDiscountToLineItems.ts
│   │   │   │   ├── applyPercentOffDiscountToLineItems.ts
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   └── index.ts
│   │   │
│   │   ├── lineItems/               # Line item building (wraps shared/utils/billingUtils)
│   │   │   ├── buildLineItems.ts
│   │   │   ├── buildInvoiceItems.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── checkout/                # Checkout params
│   │   │   ├── buildCheckoutParams.ts
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts
│   │
│   └── execute/                     # Shared executor
│       ├── executeBillingPlan.ts    # THE unified executor
│       ├── executeStripeOps.ts      # Stripe sub/invoice operations
│       ├── executeAutumnOps.ts      # DB operations
│       └── index.ts
│
├── attach/                          # ATTACH FLOW
│   ├── attachContext.ts             # AttachContext type + fetchAttachContext()
│   ├── computeAttachPlan.ts         # Attach-specific compute logic
│   ├── handleAttach.ts              # Handler (fetch → compute → execute)
│   └── index.ts
│
├── cancel/                          # CANCEL FLOW
│   ├── cancelContext.ts             # CancelContext type + fetchCancelContext()
│   ├── computeCancelPlan.ts         # Cancel-specific compute logic
│   ├── handleCancel.ts              # Handler
│   └── index.ts
│
├── subscriptionUpdate/              # SUBSCRIPTION UPDATE FLOW
│   ├── subUpdateContext.ts          # SubUpdateContext type + fetchSubUpdateContext() + resolveIntent
│   ├── computeQuantityPlan.ts       # Update quantity compute
│   ├── computePlanUpdatePlan.ts     # Update plan compute
│   ├── handleSubscriptionUpdate.ts  # Handler (routes to quantity vs plan)
│   └── index.ts
│
├── multiProduct/                    # MULTI-PRODUCT ATTACH (future)
│   ├── multiProductContext.ts
│   ├── computeMultiProductPlan.ts
│   ├── handleMultiProductAttach.ts
│   └── index.ts
│
├── REFACTOR_PLAN.md                 # Detailed refactor plan
└── FOLDER_STRUCTURE.md              # This file
```

---

## Key Principles

### 1. `_types/` and `_shared/` prefixed with underscore
- Sort to top of directory listing
- Signal "shared infrastructure, not flows"

### 2. Each flow is self-contained
Each flow folder contains:
- `*Context.ts` - Type definition + fetch function + any resolve logic
- `compute*.ts` - Flow-specific compute functions
- `handle*.ts` - The route handler
- `index.ts` - Clean exports

### 3. Shared helpers have explicit, minimal interfaces
Shared helpers in `_shared/` take explicit parameters, not context objects.
This makes them usable by any flow.

### 4. Flow contexts extend BillingContext

Each flow has its own context type that extends the shared `BillingContext`.

```typescript
// _types/billingContext.ts
type BillingContext = {
  fullCus: FullCustomer;
  stripeSub?: Stripe.Subscription;
  stripeCus: Stripe.Customer;
  paymentMethod?: Stripe.PaymentMethod;
  testClockFrozenTime?: number;
};
```

#### Attach Context
"I'm adding new product(s), here's what happens to existing ones"

```typescript
// attach/attachContext.ts
type AttachContext = BillingContext & {
  products: FullProduct[];                            // What's being attached
  freeTrial?: FreeTrial;
  body: AttachBodyV1;
  
  // Resolved during fetch (via resolveAttachActions):
  ongoingCusProductAction?: OngoingCusProductAction;  // What happens to current main product
  scheduledCusProductAction?: ScheduledCusProductAction; // What happens to scheduled product
};
```

#### Cancel Context
"I'm canceling THIS specific cus product"

```typescript
// cancel/cancelContext.ts
type CancelContext = BillingContext & {
  targetCusProduct: FullCusProduct;    // What we're canceling
  expireImmediately: boolean;
  prorate: boolean;
  defaultProduct?: FullProduct;        // Transition to this after cancel (if exists)
  body: CancelBody;
};
```

#### Subscription Update Context
"I'm modifying THIS specific cus product"

```typescript
// subscriptionUpdate/subUpdateContext.ts
type SubUpdateContext = BillingContext & {
  targetCusProduct: FullCusProduct;              // What we're updating
  body: SubUpdateBody;
  
  // Resolved during fetch (via resolveSubUpdateIntent):
  intent: "update_quantity" | "update_plan";
  optionsToUpdate?: OptionsUpdate[];             // If quantity update
  newProduct?: FullProduct;                      // If plan update (with custom items)
};
```

#### Flow Pattern Summary

| Flow | References | Why |
|------|-----------|-----|
| **Attach** | `ongoingCusProductAction`, `scheduledCusProductAction` | Adding new product(s), determines what happens to existing |
| **Cancel** | `targetCusProduct` | Operating on a specific cus product to cancel |
| **Update** | `targetCusProduct` + `intent` | Operating on a specific cus product to modify |

### 5. All flows produce the same BillingPlan
```typescript
type BillingPlan = {
  intent: "attach" | "cancel" | "update_quantity" | "update_plan";
  stripe: { ... };
  autumn: { ... };
};
```

### 6. Single unified executor
All flows call `executeBillingPlan()` with their computed plan.
The executor doesn't know which flow produced the plan.

---

## Utility Layers

There are three layers of billing utilities:

### Layer 1: Pure Calculations (shared/)

```
shared/utils/billingUtils/
├── cycleUtils/                      # Billing cycle math
│   ├── getCycleEnd.ts
│   ├── getCycleStart.ts
│   ├── getCycleIntervalFunctions.ts
│   └── getLineItemBillingPeriod.ts
│
├── intervalUtils/                   # Interval arithmetic
│   └── intervalArithmetic.ts
│
└── invoicingUtils/                  # Line item calculations
    ├── cusProductToLineItems.ts
    ├── cusProductToArrearLineItems.ts
    │
    ├── lineItemBuilders/            # Build line items from prices
    │   ├── buildLineItem.ts
    │   ├── fixedPriceToLineItem.ts
    │   └── usagePriceToLineItem.ts
    │
    ├── lineItemUtils/               # Amount calculations
    │   ├── priceToLineAmount.ts
    │   ├── tiersToLineAmount.ts
    │   ├── lineItemToCredit.ts
    │   └── roundUsageToNearestBillingUnit.ts
    │
    ├── prorationUtils/              # Proration math
    │   ├── applyProration.ts
    │   └── applyProrationToLineItem.ts
    │
    └── descriptionUtils/            # Invoice descriptions
        ├── featureUsageToDescription.ts
        ├── fixedPriceToLineDescription.ts
        ├── usagePriceToLineDescription.ts
        └── lineItemToPeriodDescription.ts
```

**Characteristics**: No dependencies, pure functions, can be used by frontend

### Layer 2: Server Utilities (v2/_shared/compute/)

See folder structure above. These utilities:
- Need `AutumnContext` or Stripe types
- Wrap/orchestrate Layer 1 pure calculations
- Are reusable by all flows (attach, cancel, update)

### Layer 3: Flow Orchestration (v2/{flow}/)

Flow-specific compute functions that use Layer 2 helpers:
- `computeAttachPlan.ts`
- `computeCancelPlan.ts`
- `computeQuantityPlan.ts`
- `computePlanUpdatePlan.ts`

### Visual Summary

```
┌─────────────────────────────────────────────────────────────┐
│  shared/utils/billingUtils/                                 │
│  PURE CALCULATIONS (no dependencies)                        │
│  Can be used by frontend for previews                       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ imports
┌─────────────────────────────────────────────────────────────┐
│  server/billing/v2/_shared/compute/                         │
│  SERVER UTILITIES (needs AutumnContext, Stripe types)       │
│  Reusable by all flows                                      │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ imports
┌─────────────────────────────────────────────────────────────┐
│  server/billing/v2/{attach,cancel,subscriptionUpdate}/      │
│  FLOW-SPECIFIC ORCHESTRATION                                │
│  Uses _shared/compute + flow-specific logic                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Import Pattern

```typescript
// attach/handleAttach.ts
import { BillingPlan } from "../_types";
import { fetchStripeSub, fetchStripeCustomer } from "../_shared/fetch";
import { executeBillingPlan } from "../_shared/execute";
import { fetchAttachContext, AttachContext } from "./attachContext";
import { computeAttachPlan } from "./computeAttachPlan";

export const handleAttach = createRoute({
  handler: async (c) => {
    const ctx = c.get("ctx");
    const body = c.req.valid("json");
    
    const attachContext = await fetchAttachContext({ ctx, body });
    const plan = computeAttachPlan({ ctx, attachContext });
    const result = await executeBillingPlan({ ctx, plan });
    
    return c.json({ success: true, ...result });
  },
});
```

---

## Migration Reference

| Current Location | New Location in v2/_shared/compute/ |
|------------------|-------------------------------------|
| `billingUtils/stripeAdapter/cusProductToStripeItemSpecs.ts` | `stripe/subItems/cusProductToStripeItemSpecs.ts` |
| `billingUtils/stripeAdapter/buildSubItems/*` | `stripe/subItems/*` |
| `billingUtils/stripeAdapter/stripeInvoiceOps/*` | `stripe/invoice/*` |
| `billingUtils/stripeAdapter/applyStripeDiscounts/*` | `stripe/discounts/*` |
| `billingUtils/initFullCusProduct/*` | `cusProduct/*` |

**Note**: `shared/utils/billingUtils/` stays in place - it's pure calculations used by frontend too.

