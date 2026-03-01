# Plan: Store Invoice Line Items on Invoice Renewal

## Problem

Currently, invoice line items are only stored during the initial attach flow (via `executeAutumnBillingPlan` → `StoreInvoiceLineItems` workflow). On renewal (`invoice.created` / `invoice.finalized`), no line items are persisted to our `invoice_line_items` table.

## Context: What Happens on Renewal

### `invoice.created` (subscription_cycle)
1. **Stripe auto-creates line items** for recurring subscription items (base price, prepaid, allocated) based on subscription item definitions.
2. **Autumn adds consumable (arrear) line items** via `processConsumablePricesForInvoiceCreated` → `eventContextToArrearLineItems` → `createStripeInvoiceItems`.
3. **Autumn processes prepaid/allocated resets** (balance updates, rollover, etc.)
4. **Autumn upserts the Autumn invoice record** via `upsertAutumnInvoice`.

At this point, the invoice is still a **draft** — line items can still change (Stripe dashboard edits, Autumn dashboard edits, etc.).

### `invoice.finalized`
1. **Invoice becomes immutable** — line items are locked, amounts are final.
2. **Autumn creates/updates the Autumn invoice record** (has fallback creation if `invoice.created` didn't create it).

## Approach: Trigger on BOTH with upsert semantics

- **`invoice.created`**: Generate Autumn `LineItem[]` from cusProducts (in-advance + arrear), trigger `StoreInvoiceLineItems` workflow with rich matching context.
- **`invoice.finalized`**: Re-trigger `StoreInvoiceLineItems` workflow (without Autumn line items — just Stripe line items + subscription item metadata). Uses upsert-by-`stripe_id` to reconcile, and deletes any DB line items no longer in Stripe.

### Why both?
A user can add/remove line items on the Stripe or Autumn dashboard between `invoice.created` and `invoice.finalized`. The finalized step is the insurance policy to ensure our DB matches the final locked state.

## Discount Handling

### Current behavior
In `mergeStripeAndBillingLineItems` (stripeLineItemGroupToDbLineItems.ts:127-140):
- `amount` = `stripeLineItem.amount` (from Stripe)
- `amount_after_discounts` = `stripeLineItem.amount - sum(discount_amounts)` (from Stripe)
- `discounts` = converted from `stripeLineItem.discount_amounts` via `stripeDiscountsToDbDiscounts`

### Problem with `discountable: false`
When `context.discountable === false` on the Autumn line item:
1. Autumn pre-calculates discounts and sends `amountAfterDiscounts` as the amount to Stripe
2. Stripe receives the already-discounted amount → `stripeLineItem.amount` = post-discount
3. Stripe's `discount_amounts` is empty (Stripe doesn't apply discounts to non-discountable items)
4. **Result**: `amount` and `amount_after_discounts` in our DB are both the post-discount value, and `discounts` array is empty. We lose the original pre-discount amount and discount breakdown.

### Fix: Use Autumn discount data when `discountable === false`

In `mergeStripeAndBillingLineItems`, add logic:

```typescript
// Determine discount data source based on discountable flag
const autumnDiscountable = primaryLineItem.context.discountable ?? true;

if (!autumnDiscountable && primaryLineItem.discounts.length > 0) {
  // Non-discountable: Autumn pre-calculated discounts. Stripe amount is already post-discount.
  // Use Autumn's original amount (pre-discount) and discount breakdown.
  amount = primaryLineItem.amount; // Pre-discount amount from Autumn
  amountAfterDiscounts = primaryLineItem.amountAfterDiscounts; // Post-discount from Autumn
  discounts = primaryLineItem.discounts.map(d => ({
    amount_off: d.amountOff,
    percent_off: d.percentOff,
    stripe_coupon_id: d.stripeCouponId,
  }));
} else {
  // Discountable: Stripe handles discounts. Use Stripe's discount_amounts.
  amount = stripeToAtmnAmount({ amount: stripeLineItem.amount, currency: stripeLineItem.currency });
  const discountTotal = (stripeLineItem.discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
  amountAfterDiscounts = stripeToAtmnAmount({ amount: stripeLineItem.amount - discountTotal, currency: stripeLineItem.currency });
  discounts = stripeDiscountsToDbDiscounts({ discountAmounts: stripeLineItem.discount_amounts, currency: stripeLineItem.currency });
}
```

This change goes in `stripeLineItemGroupToDbLineItems.ts` in the `mergeStripeAndBillingLineItems` function.

## Detailed Implementation Plan

### Step 1: DB Migration — Unique partial index on `stripe_id`

Create migration `shared/drizzle/0026_invoice_line_item_stripe_id_unique.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_stripe_id_unique 
ON invoice_line_items (stripe_id) WHERE stripe_id IS NOT NULL;
```

Also update `shared/models/cusModels/invoiceModels/invoiceLineItemTable.ts` to add the unique index in Drizzle schema.

### Step 2: Add `upsertMany` to `invoiceLineItemRepo`

New file: `server/src/internal/invoices/lineItems/repos/upsertMany.ts`

Uses Drizzle's `onConflictDoUpdate` targeting the `stripe_id` unique index. Updates all columns except `id`, `created_at`. For items with `stripe_id === null`, falls back to plain insert.

### Step 3: Add `deleteStaleByStripeInvoiceId` to `invoiceLineItemRepo`

New file: `server/src/internal/invoices/lineItems/repos/deleteStaleByStripeInvoiceId.ts`

Deletes line items for a `stripe_invoice_id` where `stripe_id NOT IN (...activeStripeIds)`.

### Step 4: Update `storeInvoiceLineItems` workflow

Change from `insertMany` to:
1. `upsertMany` with the new DB line items
2. `deleteStaleByStripeInvoiceId` to remove orphaned line items

Backwards-compatible — initial attach still works because first upsert = insert.

Also remove the `console.log("STRIPE LINE ITEMS", ...)` debug log on line 33.

### Step 5: Fix discount handling in `mergeStripeAndBillingLineItems`

In `stripeLineItemGroupToDbLineItems.ts`:
- When `primaryLineItem.context.discountable === false` and the Autumn line item has `discounts`, use Autumn's `amount`, `amountAfterDiscounts`, and `discounts` instead of Stripe's.
- When `discountable === true` (or no Autumn match), continue using Stripe's `discount_amounts` as-is.

### Step 6: Create `cusProductsToRenewalLineItems`

New file: `server/src/external/stripe/webhookHandlers/common/cusProductsToRenewalLineItems.ts`

This function takes the `InvoiceCreatedContext` and the arrear line items (already generated by `processConsumablePricesForInvoiceCreated`) and combines them with in-advance line items:

```typescript
export const cusProductsToRenewalLineItems = ({
  ctx,
  eventContext,
  arrearLineItems,
}: {
  ctx: StripeWebhookContext;
  eventContext: InvoiceCreatedContext;
  arrearLineItems: LineItem[];
}): LineItem[] => {
  const { customerProducts, stripeSubscription } = eventContext;
  const lineItems: LineItem[] = [];

  // 1. In-advance line items (base, prepaid, allocated) for each cusProduct
  const billingContext = buildBillingContextForArrearInvoice({ eventContext });
  for (const cusProduct of customerProducts) {
    lineItems.push(
      ...customerProductToLineItems({
        ctx,
        customerProduct: cusProduct,
        billingContext,
        direction: "charge",
      })
    );
  }

  // 2. Append arrear line items (already generated, passed in)
  lineItems.push(...arrearLineItems);

  return lineItems;
};
```

### Step 7: Modify `processConsumablePricesForInvoiceCreated` to return arrear line items

Change return type from `Promise<void>` to `Promise<LineItem[]>`.
Return the `lineItems` array that's already being generated.

### Step 8: Wire into `handleStripeInvoiceCreated`

In `handleStripeInvoiceCreated.ts`, after existing task calls:

```typescript
// Existing:
const arrearLineItems = await processConsumablePricesForInvoiceCreated({ ctx, eventContext });
await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
await processAllocatedPricesForInvoiceCreated({ ctx, eventContext });
await upsertAutumnInvoice({ ctx, eventContext });

// New: Store invoice line items
const autumnInvoice = await InvoiceService.getByStripeId({
  db: ctx.db,
  stripeId: eventContext.stripeInvoice.id,
});

if (autumnInvoice) {
  const renewalLineItems = cusProductsToRenewalLineItems({
    ctx,
    eventContext,
    arrearLineItems,
  });

  await workflows.triggerStoreInvoiceLineItems({
    orgId: ctx.org.id,
    env: ctx.env,
    stripeInvoiceId: eventContext.stripeInvoice.id,
    autumnInvoiceId: autumnInvoice.id,
    billingLineItems: renewalLineItems,
  });
}
```

### Step 9: Refactor `handleInvoiceFinalized` → `handleStripeInvoiceFinalized/`

Create new folder following the established pattern:

```
handleStripeInvoiceFinalized/
├── handleStripeInvoiceFinalized.ts
├── setupInvoiceFinalizedContext.ts
└── tasks/
    ├── upsertAutumnInvoice.ts
    ├── processVercelInvoice.ts
    └── storeInvoiceLineItems.ts
```

**`InvoiceFinalizedContext`:**
```typescript
export interface InvoiceFinalizedContext {
  stripeInvoice: ExpandedStripeInvoice<[...]>;
  stripeSubscription: ExpandedStripeSubscription;  // Full object, not just ID
  stripeSubscriptionId: string;
  fullCustomer: FullCustomer;
  customerProducts: FullCusProduct[];
  autumnInvoice: Invoice | null;
}
```

**`handleStripeInvoiceFinalized`:**
```typescript
export const handleStripeInvoiceFinalized = async ({
  ctx,
  event,
}: {
  ctx: StripeWebhookContext;
  event: Stripe.InvoiceFinalizedEvent;
}) => {
  const eventContext = await setupInvoiceFinalizedContext({ ctx, event });
  if (!eventContext) return;

  await processVercelInvoice({ ctx, eventContext });
  await upsertAutumnInvoice({ ctx, eventContext });
  await storeInvoiceLineItems({ ctx, eventContext });
};
```

**`storeInvoiceLineItems` task:**
Triggers workflow **without** `billingLineItems`. The workflow matches purely by subscription item metadata + Stripe price/product IDs. The upsert preserves previously matched context from `invoice.created`. The delete-stale step removes line items that were removed before finalization.

Leave old `handleInvoiceFinalized.ts` in place.

### Step 10: Update `handleStripeWebhookEvent.ts`

Change import from `handleInvoiceFinalized` to `handleStripeInvoiceFinalized` and pass `event`.

## Files to Create

| File | Purpose |
|------|---------|
| `shared/drizzle/0026_invoice_line_item_stripe_id_unique.sql` | Migration for unique index |
| `server/src/internal/invoices/lineItems/repos/upsertMany.ts` | Upsert by stripe_id |
| `server/src/internal/invoices/lineItems/repos/deleteStaleByStripeInvoiceId.ts` | Delete orphaned line items |
| `server/src/external/stripe/webhookHandlers/common/cusProductsToRenewalLineItems.ts` | Combine in-advance + arrear line items |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/handleStripeInvoiceFinalized.ts` | New-style finalized handler |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/setupInvoiceFinalizedContext.ts` | Context setup (stores full `stripeSubscription`) |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/tasks/upsertAutumnInvoice.ts` | Invoice upsert task |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/tasks/processVercelInvoice.ts` | Vercel logic (extracted from old handler) |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/tasks/storeInvoiceLineItems.ts` | Trigger workflow for reconciliation |

## Files to Modify

| File | Change |
|------|--------|
| `shared/models/cusModels/invoiceModels/invoiceLineItemTable.ts` | Add unique index on stripe_id |
| `server/src/internal/invoices/lineItems/repos/index.ts` | Export new repo functions |
| `server/src/internal/billing/v2/workflows/storeInvoiceLineItems/storeInvoiceLineItems.ts` | Use upsert + delete-stale; remove debug console.log |
| `server/src/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/stripeLineItemGroupToDbLineItems.ts` | Fix discount handling for non-discountable items |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated.ts` | Trigger workflow after upsert |
| `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated.ts` | Return arrear line items |
| `server/src/external/stripe/handleStripeWebhookEvent.ts` | Import new finalized handler |

## Key Decisions Made

1. **Trigger on both `invoice.created` AND `invoice.finalized`** — user confirmed, since line items can change between the two events.
2. **`InvoiceFinalizedContext` stores full `stripeSubscription`** not just ID — consistent with `InvoiceCreatedContext` pattern.
3. **Discount fix in `stripeLineItemGroupToDbLineItems.ts`** — when `discountable === false`, use Autumn line item's pre-calculated discounts instead of Stripe's empty discount_amounts.
4. **Arrear line items captured from `processConsumablePricesForInvoiceCreated`** and passed to `cusProductsToRenewalLineItems` — avoids the timing problem where balances are already reset.
