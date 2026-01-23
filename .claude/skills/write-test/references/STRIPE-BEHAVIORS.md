# Stripe Behaviors Reference

How Stripe handles billing events and how Autumn responds to them.

## Consumable (Arrear) Billing

Consumable items are charged in arrears - usage is tracked during a billing period and charged at the end.

### Renewals (invoice.created)

For regular billing cycle renewals, we use the `invoice.created` webhook to add consumable line items.

**Handler:** `server/src/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated.ts`

**How it works:**
1. Stripe fires `invoice.created` at the start of each billing cycle
2. We check if it's a periodic invoice (`billing_reason === "subscription_cycle"`)
3. We calculate usage for the previous period and add line items to the draft invoice
4. Stripe then finalizes and charges the invoice

### Last Invoice (Cancellation)

When a subscription is canceled, the handling differs between customer-level and entity-level products.

#### Customer-Level Products (Stripe Metered Items)

**Stripe Behavior:** Stripe creates an EXTRA invoice after the subscription is canceled because metered items (usage-based) need final usage to be billed.

**Handler:** `invoice.created` still applies - same as renewals

**Important:** If a trial ends (not a cancellation), Stripe does NOT create an extra invoice. We detect this by checking if `current_period_start === trial_end` and skip consumable charges in that case.

```typescript
// From processConsumablePricesForInvoiceCreated.ts
const hasTrialJustEnded = ({ stripeSubscription }) => {
  const trialEnd = stripeSubscription.trial_end;
  if (!trialEnd) return false;
  const periodStart = getLatestPeriodStart({ sub: stripeSubscription });
  return trialEnd === periodStart;
};
```

#### Entity-Level Products (Non-Metered)

**Stripe Behavior:** Stripe does NOT create an extra invoice because we use empty price items ($0 placeholder prices for entity subscriptions).

**Handler:** `server/src/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/processConsumablePricesForSubscriptionDeleted.ts`

**How it works:**
1. When `subscription.deleted` fires, we check if the subscription has metered items
2. If NO metered items (entity-level), we manually create an invoice for arrear charges
3. We skip this if:
   - Subscription has metered items (Stripe handles it via `invoice.created`)
   - It was an immediate cancellation (no overage charged on immediate cancels)
   - It was a trial cancellation (`ended_at === trial_end`)

```typescript
// From processConsumablePricesForSubscriptionDeleted.ts
const wasTrialCancellation = (stripeSubscription) => {
  const trialEnd = stripeSubscription.trial_end;
  const endedAt = stripeSubscription.ended_at;
  if (!trialEnd || !endedAt) return false;
  return trialEnd === endedAt;
};
```

### Summary Table

| Scenario | Customer-Level (Metered) | Entity-Level (Non-Metered) |
|----------|--------------------------|----------------------------|
| **Renewal** | `invoice.created` | `invoice.created` |
| **Cancel End-of-Cycle** | Stripe creates extra invoice → `invoice.created` | No extra invoice → `subscription.deleted` creates invoice |
| **Cancel Immediately** | No overage charged | No overage charged |
| **Trial Ends** | No extra invoice, skip consumable charges | No extra invoice, skip consumable charges |
| **Cancel at Trial End** | Skip consumable charges | Skip consumable charges |

### Key Differences

1. **Metered vs Non-Metered:** Stripe only creates an extra final invoice for subscriptions with metered items
2. **Trial Handling:** Both paths skip billing when trial ends - trial usage is free
3. **Immediate Cancel:** Neither path bills for overage on immediate cancellations
