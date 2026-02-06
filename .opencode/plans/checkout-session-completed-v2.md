# V2 Checkout Session Completed Implementation Plan

## Overview

Implement the V2 flow for `checkout.session.completed` webhook handler. The V2 flow uses the new billing plan architecture where:
1. Billing plan is stored in metadata during checkout session creation
2. When checkout completes, we modify the billing plan based on checkout results
3. Execute the deferred billing plan (which now handles invoice/subscription upserts)

## Current State

- ✅ Main entry point created: `handleStripeCheckoutSessionCompleted.ts`
- ✅ Context setup created: `setupCheckoutSessionCompletedContext.ts`
- ✅ Legacy files moved to `legacy/` folder
- ⏳ V2 flow returns early with "not yet implemented" log

## Architecture Changes

### 1. Extend AutumnBillingPlan Schema

**File:** `server/src/internal/billing/v2/types/autumnBillingPlan.ts`

Add two new optional fields:

```typescript
export const AutumnBillingPlanSchema = z.object({
  // ...existing fields...
  
  // NEW: Insert operations for subscription and invoice
  insertSubscription: SubscriptionSchema.optional(),
  upsertInvoice: InvoiceSchema.optional(),
});
```

**Rationale:** By adding these to the billing plan, we can:
- Use the same `executeAutumnBillingPlan` for all flows
- Keep billing operations centralized
- Allow both immediate execution and deferred execution to use the same path

### 2. Update executeAutumnBillingPlan

**File:** `server/src/internal/billing/v2/execute/executeAutumnBillingPlan.ts`

Add at the end:

```typescript
// 6. Insert subscription (if provided)
if (autumnBillingPlan.insertSubscription) {
  await SubService.upsert({
    db,
    subscription: autumnBillingPlan.insertSubscription,
  });
}

// 7. Upsert invoice (if provided)
if (autumnBillingPlan.upsertInvoice) {
  await InvoiceService.upsert({
    db,
    invoice: autumnBillingPlan.upsertInvoice,
  });
}
```

### 3. Add Upsert Methods to Services

**File:** `server/src/internal/subscriptions/SubService.ts`

```typescript
static async upsert({
  db,
  subscription,
}: {
  db: DrizzleCli;
  subscription: Subscription;
}) {
  const updateColumns = buildConflictUpdateColumns(subscriptions, ["id"]);
  await db
    .insert(subscriptions)
    .values(subscription)
    .onConflictDoUpdate({
      target: subscriptions.stripe_id,
      set: updateColumns,
    });
}
```

**File:** `server/src/internal/invoices/InvoiceService.ts`

```typescript
static async upsert({
  db,
  invoice,
}: {
  db: DrizzleCli;
  invoice: Invoice;
}) {
  const updateColumns = buildConflictUpdateColumns(invoices, ["id"]);
  await db
    .insert(invoices)
    .values(invoice as any)
    .onConflictDoUpdate({
      target: invoices.stripe_id,
      set: updateColumns,
    });
}
```

### 4. Modify upsertInvoiceFromBilling and upsertSubscriptionFromBilling

These functions currently call services directly. Change them to **build** the Autumn objects and add to the billing plan instead.

**File:** `server/src/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling.ts`

Change from:
```typescript
export const upsertSubscriptionFromBilling = async ({
  ctx,
  stripeSubscription,
}: {
  ctx: AutumnContext;
  stripeSubscription: Stripe.Subscription;
}) => {
  // ... calls SubService directly
}
```

To:
```typescript
export const buildSubscriptionFromStripe = ({
  ctx,
  stripeSubscription,
}: {
  ctx: AutumnContext;
  stripeSubscription: Stripe.Subscription;
}): Subscription => {
  const earliestPeriodEnd = getEarliestPeriodEnd({ sub: stripeSubscription });
  const currentPeriodStart = getLatestPeriodStart({ sub: stripeSubscription });

  return {
    id: generateId("sub"),
    stripe_id: stripeSubscription.id,
    stripe_schedule_id: stripeSubscription.schedule as string | null,
    created_at: stripeSubscription.created * 1000,
    usage_features: [],
    org_id: ctx.org.id,
    env: ctx.env,
    current_period_start: currentPeriodStart,
    current_period_end: earliestPeriodEnd,
  };
};

// Keep old function for backward compatibility, but call the new one
export const upsertSubscriptionFromBilling = async ({
  ctx,
  stripeSubscription,
}: {
  ctx: AutumnContext;
  stripeSubscription: Stripe.Subscription;
}) => {
  const subscription = buildSubscriptionFromStripe({ ctx, stripeSubscription });
  await SubService.upsert({ db: ctx.db, subscription });
};
```

**File:** `server/src/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling.ts`

Similar pattern - add `buildInvoiceFromStripe` that returns `Invoice` object.

---

## Checkout Session Completed Tasks

### Task Structure

```
handleStripeCheckoutSessionCompleted/
├── handleStripeCheckoutSessionCompleted.ts   # Main entry
├── setupCheckoutSessionCompletedContext.ts   # Already done
├── legacy/                                    # Already done
└── tasks/
    ├── modifyStripeSubscriptionFromCheckout.ts  # Task 1
    ├── updateBillingPlanFromCheckout.ts         # Task 2  
    ├── queueCheckoutRewardTasks.ts              # Task 3
    └── updateCustomerFromCheckout.ts            # Task 4
```

### Main Handler Flow

```typescript
// handleStripeCheckoutSessionCompleted.ts
if (checkoutContext) {
  const { metadata, stripeSubscription, stripeInvoice, stripeCheckoutSession } = checkoutContext;
  const billingPlanData = metadata.data as DeferredAutumnBillingPlanData;

  // 1. Modify Stripe subscription (swap metered→empty, migrate to flexible)
  if (stripeSubscription) {
    await modifyStripeSubscriptionFromCheckout({ ctx, checkoutContext });
  }

  // 2. Update billing plan with checkout data (adds insertSubscription, upsertInvoice)
  const updatedBillingPlanData = updateBillingPlanFromCheckout({ 
    ctx, 
    checkoutContext,
    billingPlanData,
  });

  // 3. Execute deferred billing plan with updated data
  await executeDeferredBillingPlanFromCheckout({ 
    ctx, 
    metadata, 
    billingPlanData: updatedBillingPlanData,
  });

  // 4. Queue checkout reward tasks
  await queueCheckoutRewardTasks({ ctx, checkoutContext });

  // 5. Update customer name/email
  await updateCustomerFromCheckout({ ctx, checkoutContext });
  
  return;
}
```

### Task 1: modifyStripeSubscriptionFromCheckout

**Purpose:** Modify the Stripe subscription after checkout creates it.

**Actions:**
1. Swap metered prices → empty prices (for entity-attached products)
2. Migrate subscription to flexible billing mode

**Note:** Leave a TODO comment for "Create Autumn Subscription" - will be handled by billing plan now.

### Task 2: updateBillingPlanFromCheckout

**Purpose:** Modify the billing plan based on checkout results.

**Actions:**
1. Extract prepaid quantities from checkout line items → update `insertCustomerProducts` (handle later)
2. Build `insertSubscription` from Stripe subscription using `buildSubscriptionFromStripe`
3. Build `upsertInvoice` from Stripe invoice using `buildInvoiceFromStripe`
4. Return new `DeferredAutumnBillingPlanData` with updated `billingPlan.autumn`

### Task 3: queueCheckoutRewardTasks

**Purpose:** Queue reward jobs for each product.

**Actions:**
- For each product in `billingPlan.autumn.insertCustomerProducts`
- Queue `JobName.TriggerCheckoutReward` with customer/product/subId

### Task 4: updateCustomerFromCheckout

**Purpose:** Sync customer name/email from Stripe checkout details.

**Actions:**
- If customer is missing name in Autumn but has it in checkout → update
- If customer is missing email in Autumn but has it in checkout → update

---

## Implementation Order

### Phase 1: Schema & Service Updates
1. Add `insertSubscription` and `upsertInvoice` to `AutumnBillingPlanSchema`
2. Add `SubService.upsert()` method
3. Add `InvoiceService.upsert()` method
4. Update `executeAutumnBillingPlan` to handle new fields

### Phase 2: Build Functions
5. Create `buildSubscriptionFromStripe` in upsertSubscriptionFromBilling.ts
6. Create `buildInvoiceFromStripe` in upsertInvoiceFromBilling.ts
7. Update existing `upsertSubscriptionFromBilling` to use new builder
8. Update existing `upsertInvoiceFromBilling` to use new builder

### Phase 3: Checkout Tasks
9. Create `modifyStripeSubscriptionFromCheckout.ts`
10. Create `updateBillingPlanFromCheckout.ts`
11. Create `queueCheckoutRewardTasks.ts`
12. Create `updateCustomerFromCheckout.ts`

### Phase 4: Wire It Up
13. Update `handleStripeCheckoutSessionCompleted.ts` to call tasks
14. Test the full flow

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/internal/billing/v2/types/autumnBillingPlan.ts` | Add `insertSubscription`, `upsertInvoice` fields |
| `server/src/internal/billing/v2/execute/executeAutumnBillingPlan.ts` | Handle new upsert fields |
| `server/src/internal/subscriptions/SubService.ts` | Add `upsert()` method |
| `server/src/internal/invoices/InvoiceService.ts` | Add `upsert()` method |
| `server/src/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling.ts` | Add `buildSubscriptionFromStripe` |
| `server/src/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling.ts` | Add `buildInvoiceFromStripe` |

## New Files to Create

| File | Purpose |
|------|---------|
| `handleStripeCheckoutSessionCompleted/tasks/modifyStripeSubscriptionFromCheckout.ts` | Swap metered prices, migrate to flexible |
| `handleStripeCheckoutSessionCompleted/tasks/updateBillingPlanFromCheckout.ts` | Build subscription/invoice, update billing plan |
| `handleStripeCheckoutSessionCompleted/tasks/queueCheckoutRewardTasks.ts` | Queue reward jobs |
| `handleStripeCheckoutSessionCompleted/tasks/updateCustomerFromCheckout.ts` | Sync customer name/email |

---

## Deferred Items

- **Prepaid quantities extraction:** Will handle later (Task A from original analysis)
- **Allocated prices:** Skip for now, add comment
- **Idempotency check:** Removed per user feedback
