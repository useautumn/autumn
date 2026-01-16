# Stripe Invoice Rules

This document explains when Stripe automatically creates invoices vs when Autumn should create manual invoices. Getting this wrong results in double-charging customers.

## The Problem

Stripe automatically creates and charges invoices in certain scenarios. If Autumn also creates a manual invoice in these cases, the customer gets charged twice.

**Key insight**: We want to calculate and charge invoices ourselves when possible, but Stripe forces invoice creation in specific scenarios.

## Decision Tree

```
Should Autumn create a manual invoice?

1. Is this a subscription CREATE action?
   └── YES → NO manual invoice (Stripe creates one automatically)

2. Is this a subscription UPDATE that removes a trial?
   └── YES → NO manual invoice (Stripe creates one automatically)

3. Is there an existing subscription being updated?
   └── NO → NO manual invoice (nothing to invoice against)

4. Otherwise:
   └── YES → Create manual invoice
```

## Key Functions

### shouldCreateManualStripeInvoice

**Location**: `billing/v2/providers/stripe/utils/invoices/shouldCreateManualStripeInvoice.ts`

Returns `true` if Autumn should create a manual invoice.

```typescript
export const shouldCreateManualStripeInvoice = ({
  billingContext,
  stripeSubscriptionAction,
}: {
  billingContext: BillingContext;
  stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
  // Case 1: Creating a subscription → Stripe handles invoice
  const isCreateAction = stripeSubscriptionAction?.type === "create";
  if (isCreateAction) return false;

  // Case 2: No subscription exists → Nothing to invoice against
  const { stripeSubscription } = billingContext;
  if (!stripeSubscription) return false;

  // Case 3: Update removes trial → Stripe handles invoice
  const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
    billingContext,
    stripeSubscriptionAction,
  });
  if (updateWillCreateInvoice) return false;

  // Case 4: Otherwise → We create manual invoice
  return true;
};
```

### willStripeSubscriptionUpdateCreateInvoice

**Location**: `billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice.ts`

Returns `true` if a subscription UPDATE will cause Stripe to create an invoice.

```typescript
export const willStripeSubscriptionUpdateCreateInvoice = ({
  billingContext,
  stripeSubscriptionAction,
}: {
  billingContext: BillingContext;
  stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
  // Only applies to update actions
  const actionType = stripeSubscriptionAction?.type;
  if (actionType !== "update") return false;

  // Check trial state transition
  const { isTrialing, willBeTrialing } = getTrialStateTransition({ billingContext });

  // Removing trial → Stripe creates invoice
  if (isTrialing && !willBeTrialing) return true;

  return false;
};
```

### getTrialStateTransition

Determines current and future trial state:

```typescript
export const getTrialStateTransition = ({
  billingContext,
}: {
  billingContext: BillingContext;
}): { isTrialing: boolean; willBeTrialing: boolean } => {
  const { stripeSubscription, trialContext, currentEpochMs } = billingContext;

  // Current state: subscription is in trial
  const isTrialing = stripeSubscription?.status === "trialing";

  // Future state: trial will continue
  const trialEndsAt = trialContext?.trialEndsAt;
  const willBeTrialing = trialEndsAt ? trialEndsAt > currentEpochMs : false;

  return { isTrialing, willBeTrialing };
};
```

## Scenarios

### Scenario 1: Creating a New Subscription

**Action**: `stripeSubscriptionAction.type === "create"`

**What happens**:
1. Stripe creates subscription
2. Stripe automatically creates and charges first invoice
3. No manual invoice needed

**If we create manual invoice**: Double charge!

### Scenario 2: Removing Trial from Subscription

**Action**: `stripeSubscriptionAction.type === "update"` with `trial_end: "now"`

**What happens**:
1. Stripe updates subscription to remove trial
2. Stripe automatically creates and charges invoice for full period
3. No manual invoice needed

**If we create manual invoice**: Double charge!

### Scenario 3: Updating Subscription Items (No Trial Change)

**Action**: `stripeSubscriptionAction.type === "update"` (normal update)

**What happens**:
1. Stripe updates subscription items
2. Stripe does NOT automatically create invoice
3. We need to create manual invoice for prorations/charges

**If we don't create manual invoice**: Customer not charged for changes!

### Scenario 4: Updating While on Trial (Trial Continues)

**Action**: `stripeSubscriptionAction.type === "update"` while trialing, trial still continues

**What happens**:
1. Stripe updates subscription items
2. Trial continues → no immediate charge
3. We may still create manual invoice (depends on line items)

## Usage in evaluateStripeBillingPlan

```typescript
// From: providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts

export const evaluateStripeBillingPlan = async ({
  ctx,
  billingContext,
  autumnBillingPlan,
}: { ... }): Promise<StripeBillingPlan> => {
  // ... build subscription action ...

  const { lineItems } = autumnBillingPlan;

  // Determine if we should create manual invoice
  const createManualInvoice = shouldCreateManualStripeInvoice({
    billingContext,
    stripeSubscriptionAction,
  });

  let stripeInvoiceAction: StripeInvoiceAction | undefined;
  let stripeInvoiceItemsAction: StripeInvoiceItemsAction | undefined;
  
  if (createManualInvoice) {
    // Build invoice with our calculated line items
    stripeInvoiceAction = buildStripeInvoiceAction({ lineItems });
    stripeInvoiceItemsAction = buildStripeInvoiceItemsAction({ lineItems, billingContext });
  }

  return {
    subscriptionAction: stripeSubscriptionAction,
    invoiceAction: stripeInvoiceAction,
    invoiceItemsAction: stripeInvoiceItemsAction,
    subscriptionScheduleAction: stripeSubscriptionScheduleAction,
  };
};
```

## Line Items

When we create a manual invoice, we use our calculated line items:

```typescript
// From: compute/computeAutumnUtils/buildAutumnLineItems.ts

export const buildAutumnLineItems = ({
  ctx,
  newCustomerProducts,
  deletedCustomerProduct,
  billingContext,
}: { ... }) => {
  // Refund line items for deleted product
  const deletedLineItems = deletedCustomerProduct
    ? customerProductToLineItems({
        ctx,
        customerProduct: deletedCustomerProduct,
        billingContext,
        direction: "refund",
        priceFilters: { excludeOneOffPrices: true },
      })
    : [];

  // Charge line items for new products
  const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
    customerProductToLineItems({
      ctx,
      customerProduct: newCustomerProduct,
      billingContext,
      direction: "charge",
    }),
  );

  return [...deletedLineItems, ...newLineItems];
};
```

## Common Issues

### Double Charge

**Symptom**: Customer charged twice for the same change

**Cause**: Created manual invoice when Stripe already created one

**Fix**: Check `shouldCreateManualStripeInvoice` returns `false` for:
- Subscription creation
- Trial removal

### No Charge

**Symptom**: Customer not charged for subscription change

**Cause**: Didn't create manual invoice when needed

**Fix**: Check `shouldCreateManualStripeInvoice` returns `true` for normal updates

### Wrong Amount

**Symptom**: Invoice amount is incorrect

**Cause**: Line items calculated incorrectly

**Fix**: Check `buildAutumnLineItems` output, verify proration calculations

## Key Files

| File | Purpose |
|------|---------|
| `shouldCreateManualStripeInvoice.ts` | Decides if we create invoice |
| `willStripeSubscriptionUpdateCreateInvoice.ts` | Checks if Stripe creates invoice on update |
| `getTrialStateTransition.ts` | Determines trial state changes |
| `buildStripeInvoiceAction.ts` | Builds manual invoice action |
| `buildStripeInvoiceItemsAction.ts` | Builds invoice items action |
| `buildAutumnLineItems.ts` | Calculates line items |
