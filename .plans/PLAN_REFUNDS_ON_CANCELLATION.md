# Plan: Refund on Cancel Subscription (v2)

## Overview

Revamp the immediate cancellation flow to offer three refund behaviors:
- **Credits** — current behavior: compute prorated negative line items → Stripe invoice credit
- **Refund** — new: refund the latest invoice's charge (prorated or full amount)
- **None** — cancel without any credit or refund

## Cancel Sheet Layout

```
[Cancellation]
  End of billing cycle  |  Cancel immediately

[Refund Behavior]  ← only when cancel_immediately
  Credits  |  Refund  |  None

[Advanced]
  No billing changes: on/off
  Refund amount: Prorated / Full  ← only when refund selected

[Pricing Preview]
[Cancel Subscription]
```

## API Contract

**New param:** `refund_last_payment: z.enum(["prorated", "full"]).optional().meta({ internal: true })`

**Mutual exclusivity:** `billing_behavior` and `refund_last_payment` cannot both be set (`.refine()`)

| UI Selection | `cancel_action` | `billing_behavior` | `refund_last_payment` |
|---|---|---|---|
| Credits | `cancel_immediately` | `prorate_immediately` | `undefined` |
| Refund + Prorated | `cancel_immediately` | `undefined` | `"prorated"` |
| Refund + Full | `cancel_immediately` | `undefined` | `"full"` |
| None | `cancel_immediately` | `"none"` | `undefined` |
| End of cycle | `cancel_end_of_cycle` | `undefined` | `undefined` |

---

## Backend: Schema (shared)

1. **New file `shared/api/billing/common/refundLastPayment.ts`** — `RefundLastPaymentSchema`
2. **Edit `updateSubscriptionV0Params.ts`** — add field + `.refine()` mutual exclusivity
3. **Edit `updateSubscriptionV1Params.ts`** — add field with `.meta({ internal: true })` + `UPDATE_FIELDS` + `.refine()`

## Backend: Billing Context

4. **Edit `UpdateSubscriptionBillingContext`** — add `refundLastPayment?: "prorated" | "full"`
5. **Edit `setupUpdateSubscriptionBillingContext.ts`** — read `params.refund_last_payment`

## Backend: Line Item Filtering

6. **Edit `buildAutumnLineItems.ts`** — add `skipDeletedRefundLineItems` param:
```typescript
const deletedLineItems = (deletedCustomerProduct && !skipDeletedRefundLineItems)
    ? customerProductToLineItems({ ..., direction: "refund" })
    : [];
```

7. **Edit `computeCancelLineItems.ts`** — pass the flag:
```typescript
buildAutumnLineItems({
    ...,
    skipDeletedRefundLineItems: !!billingContext.refundLastPayment,
});
```

Future-proof: in upgrade + refund, same flag skips credit line items for old product while preserving charge line items for the new product.

## Backend: Stripe Refund Action

8. **New type on `StripeBillingPlan`** (shared):
```typescript
refundAction?: {
    type: "refund_last_invoice";
    stripeSubscriptionId: string;
    mode: "prorated" | "full";
    billingPeriod: { start: number; end: number };
}
```

9. **New field on `StripeBillingPlanResult`**: `stripeRefund?: Stripe.Refund`

10. **New file `buildStripeRefundAction.ts`** — builds the action from billingContext

11. **Edit `evaluateStripeBillingPlan.ts`** — call `buildStripeRefundAction()`, add to plan

12. **New file `executeStripeRefundAction.ts`** — executes the action:
    - Gets `latest_invoice` from cancelled subscription
    - `resolveChargeFromInvoice()` → reuse from `invoiceRefundUtils.ts`
    - `validateChargeRefundable()` → reuse from `invoiceRefundUtils.ts`
    - Calculate: full = refundable balance, prorated = `applyProration()`
    - `stripe.refunds.create({ charge, amount })`

13. **Edit `executeStripeBillingPlan.ts`** — add refund stage after subscription cancel

## Frontend: Form + Body Builder

14. **Edit `updateSubscriptionFormSchema.ts`** — add `refundAmount: z.enum(["prorated", "full"]).nullable()`
15. **Edit `useUpdateSubscriptionForm.ts`** — default `refundAmount: null`
16. **Edit `useUpdateSubscriptionRequestBody.ts`** — map to API body in cancel branch

## Frontend: UI

17. **New real `RefundBehaviorSection.tsx`** — three-way toggle (Credits / Refund / None)
18. **Delete `BillingBehaviorSection.tsx`** — replaced by RefundBehaviorSection
19. **Edit `CancelAdvancedSection.tsx`** — add Prorated/Full toggle
20. **Edit `CancelPreviewSection.tsx`** — handle refund mode display
21. **Edit `SubscriptionCancelSheet.tsx`** — swap sections

## Cleanup

22. **Delete `shared/api/billing/common/refundBehavior.ts`** — replaced
23. **Delete `vite/.../refundBehaviourSchema.ts`** — no longer needed

## Parallelisation

### Wave 1 (4 parallel, no deps)

| Track | Work |
|-------|------|
| A | Shared: `refundLastPayment.ts`, V0/V1 schema updates, mutual exclusivity |
| B | Billing context type + setup |
| C | `buildStripeRefundAction.ts` + `executeStripeRefundAction.ts` |
| D | Frontend: form schema + defaults + request body builder |

### Wave 2 (3 parallel, deps on Wave 1)

| Track | Work |
|-------|------|
| E | `buildAutumnLineItems.ts` flag + `computeCancelLineItems.ts` |
| F | `evaluateStripeBillingPlan.ts` + `executeStripeBillingPlan.ts` wiring |
| G | Real `RefundBehaviorSection.tsx` + advanced refund amount toggle |

### Wave 3 (deps on Wave 2)

| Track | Work |
|-------|------|
| H | Wire into cancel sheet, remove old sections, update preview |
| I | Cleanup old schema files |

## Key Files

| File | Change | Purpose |
|------|--------|---------|
| `shared/api/billing/common/refundLastPayment.ts` | **New** | Schema |
| `shared/api/billing/updateSubscription/updateSubscriptionV0Params.ts` | Edit | Add field + validation |
| `shared/api/billing/updateSubscription/updateSubscriptionV1Params.ts` | Edit | Add field (internal) |
| `shared/models/billingModels/context/updateSubscriptionBillingContext.ts` | Edit | Add `refundLastPayment` |
| `server/.../setup/setupUpdateSubscriptionBillingContext.ts` | Edit | Read param |
| `server/.../compute/computeAutumnUtils/buildAutumnLineItems.ts` | Edit | `skipDeletedRefundLineItems` flag |
| `server/.../compute/cancel/computeCancelLineItems.ts` | Edit | Pass flag |
| `server/.../providers/stripe/actionBuilders/buildStripeRefundAction.ts` | **New** | Build refund action |
| `server/.../providers/stripe/execute/executeStripeRefundAction.ts` | **New** | Execute refund |
| `server/.../providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts` | Edit | Add refund action |
| `server/.../providers/stripe/execute/executeStripeBillingPlan.ts` | Edit | Execute refund stage |
| `server/.../handlers/handleRefundInvoice/invoiceRefundUtils.ts` | Reuse | Charge resolution + validation |
| `vite/.../cancel-subscription/RefundBehaviorSection.tsx` | **New** | UI toggle |
| `vite/.../cancel-subscription/BillingBehaviorSection.tsx` | Delete | Replaced |
| `vite/.../cancel-subscription/CancelAdvancedSection.tsx` | Edit | Refund amount toggle |
| `vite/.../cancel-subscription/CancelPreviewSection.tsx` | Edit | Refund display |
| `vite/.../update-subscription-v2/updateSubscriptionFormSchema.ts` | Edit | Form field |
| `vite/.../update-subscription-v2/hooks/useUpdateSubscriptionRequestBody.ts` | Edit | Body mapping |
