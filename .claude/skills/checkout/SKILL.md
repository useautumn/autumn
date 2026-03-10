---
name: checkout
description: Understand, debug, and edit Autumn checkout flows. Covers how attach creates an Autumn checkout, how public checkout routes recompute previews, how confirmation executes billing, and when Autumn checkout vs Stripe checkout vs no checkout is chosen.
---

# Autumn Checkout Guide

## When to Use This Skill

- Debugging Autumn checkout creation, retrieval, preview, or confirmation
- Understanding why `billing.attach` returned an Autumn checkout URL
- Working on `server/src/internal/checkouts/`
- Changing how checkout previews are rendered or confirmed
- Determining whether a flow should use `autumn_checkout`, `stripe_checkout`, or no checkout
- Explaining the attach confirmation flow to another agent quickly

## Core Concept

Autumn checkout is **not** a separate billing engine. It is a thin confirmation layer around the existing V2 `attach` action.

- `attach()` still does the normal setup -> compute -> evaluate flow
- If the attach context resolves to `checkoutMode === "autumn_checkout"`, Autumn does **not** execute billing immediately
- Instead, it stores a lightweight checkout object containing the original attach params
- Public checkout routes later **re-run attach** from those stored params to build a fresh preview or to execute billing on confirm

This means the checkout does **not** persist a frozen billing plan. It persists the request, then recomputes from current state.

## Entry Point

Main path:

1. `server/src/internal/billing/v2/actions/attach/attach.ts`
2. `server/src/internal/billing/v2/actions/attach/createAutumnCheckout.ts`
3. `server/src/internal/billing/v2/utils/billingPlan/billingPlanToAutumnCheckout.ts`
4. `server/src/internal/checkouts/middleware/checkoutMiddleware.ts`
5. `server/src/internal/checkouts/handlers/handleGetCheckout.ts`
6. `server/src/internal/checkouts/handlers/handlePreviewCheckout.ts`
7. `server/src/internal/checkouts/handlers/handleConfirmCheckout.ts`

## Attach -> Autumn Checkout

`attach()` follows the normal V2 pipeline first:

```typescript
const billingContext = await setupAttachBillingContext(...)
const autumnBillingPlan = computeAttachPlan(...)
const stripeBillingPlan = await evaluateStripeBillingPlan(...)
await handleAttachV2Errors(...)
```

After that, the branch is simple:

```typescript
if (billingContext.checkoutMode === "autumn_checkout" && !skipAutumnCheckout) {
  return await createAutumnCheckout(...)
}

return await executeBillingPlan(...)
```

Important consequences:

- Autumn checkout is decided **after** the billing plan exists
- Validation already ran before the checkout is created
- `skipAutumnCheckout: true` is the escape hatch used by confirm so the second attach call executes billing instead of creating another checkout

## What Gets Stored

`billingPlanToAutumnCheckout()` builds a `Checkout` record with:

- `id`
- `org_id`
- `env`
- `internal_customer_id`
- `customer_id`
- `action: "attach"`
- `params`
- `params_version`
- `status: "pending"`
- `created_at`
- `expires_at`

Storage model:

- Cache is the primary store via `setCheckoutCache()`
- Postgres is written as audit/backup via `checkoutRepo.insert()`
- TTL is 24 hours in cache, and `expires_at` is also set on the DB record

The returned billing response uses `checkoutToUrl()` so the caller gets `/c/:checkout_id` as `payment_url`.

## Public Checkout Flow

### Router + Middleware

`server/src/internal/checkouts/checkoutRouter.ts` exposes:

- `GET /:checkout_id`
- `POST /:checkout_id/preview`
- `POST /:checkout_id/confirm`

`checkoutMiddleware` does the shared setup:

- Rate limits by checkout ID
- Loads checkout from cache first
- Falls back to DB only to determine that the checkout exists but is unavailable
- Rejects completed or expired checkouts
- Marks expired DB records as `expired`
- Rehydrates public request context with the checkout's `org`, `env`, and `features`

Key behavior: if cache is missing, the middleware does **not** rebuild the checkout from DB. It throws unavailable after checking DB for audit state.

### GET /checkouts/:checkout_id

`handleGetCheckout.ts`:

- Only supports `CheckoutAction.Attach`
- Casts `checkout.params` back to `AttachParamsV1`
- Calls `billingActions.attach({ preview: true })`
- Recomputes the current billing plan from the stored params
- Converts that plan into an attach preview response for the UI

The checkout page therefore renders current computed pricing, not a persisted snapshot from creation time.

### POST /checkouts/:checkout_id/preview

`handlePreviewCheckout.ts` is the same idea as `GET`, but it merges updated `feature_quantities` into the stored params before re-running preview attach.

Use this when debugging quantity edits in checkout UI.

### POST /checkouts/:checkout_id/confirm

`handleConfirmCheckout.ts`:

1. Validates `action === "attach"`
2. Validates `status === "pending"`
3. Re-runs `attach({ preview: false, skipAutumnCheckout: true })`
4. Executes the real billing plan
5. Deletes the cache entry so the checkout is one-time-use
6. Marks the DB row as `completed`
7. Returns success metadata including `invoice_id`

Important error behavior:

- Cache is deleted **only after** successful execution
- On failure, the checkout stays pending and cached so the user can retry
- Non-`RecaseError` failures are wrapped as internal checkout failures

## Checkout Mode Decision Tree

The decision lives in `server/src/internal/billing/v2/actions/attach/setup/setupAttachCheckoutMode.ts`.

Possible outputs:

- `null`
- `"stripe_checkout"`
- `"autumn_checkout"`

### `redirect_mode: "never"`

Always returns `null`.

No checkout URL is returned, even if one would otherwise be required.

### First Pass: Should Stripe Checkout Be Required?

Stripe checkout is chosen when Autumn cannot or should not bill directly:

- Customer has **no** payment method and product is one-off
- Customer has **no** payment method, product is paid recurring, and customer does **not** already have a Stripe subscription
- Exception: if that first paid recurring product starts with a trial and `cardRequired === false`, it returns `null` instead of Stripe checkout

Two important suppressors:

- If a payment method already exists, this pass returns `null`
- If `invoiceMode` is enabled, this pass returns `null`

### Second Pass: Forced Redirects (`redirect_mode: "always"`)

If the first pass returned `null` and `redirect_mode === "always"`, Autumn forces a redirect-style flow:

- One-off product -> `"stripe_checkout"`
- Paid recurring product with **no** existing Stripe subscription -> `"stripe_checkout"`
- Everything else -> `"autumn_checkout"`

## When Autumn Checkout Applies

Autumn checkout is the fallback for `redirect_mode: "always"` when Stripe checkout is **not** required.

In practice, that means cases like:

- Customer already has a payment method, and you still want a confirmation page before applying attach
- Customer is changing an existing recurring subscription and you want a redirect/confirmation UX
- Customer is attaching something that is neither one-off nor the first paid recurring subscription, and Stripe checkout is unnecessary
- Invoice mode is enabled, `redirect_mode` is `"always"`, and you still want the user to land on an Autumn confirmation page
- Free-product attaches with `redirect_mode: "always"` also land here

The important mental model:

- `stripe_checkout` means Stripe still needs to collect payment details or own the checkout UX
- `autumn_checkout` means Autumn already has enough context to bill, but the API caller requested a confirmation step

## What Autumn Checkout Does Not Do

- It does not support arbitrary billing actions today; handlers currently accept only `CheckoutAction.Attach`
- It does not store a frozen `billingPlan`
- It does not bypass normal attach validation
- It does not delete the DB row on success; it marks it completed and removes the cache entry
- It does not recover a missing cache entry by restoring from DB

## Debugging Checklist

If a checkout link appears unexpectedly:

- Check `params.redirect_mode`
- Check whether `setupAttachCheckoutMode()` saw a payment method
- Check whether the product is one-off, free, or paid recurring
- Check whether the customer already has a Stripe subscription
- Check whether invoice mode or a no-card-required trial suppressed Stripe checkout

If the checkout preview looks different from the original attach response:

- Remember `GET /checkouts/:id` recomputes attach from stored params
- Compare customer state between creation time and retrieval time
- Check whether feature quantities were changed via preview

If confirmation creates a second checkout instead of charging:

- Confirm the code path uses `skipAutumnCheckout: true`

If a valid-looking checkout URL says unavailable:

- Check whether the cache entry expired or was deleted
- Check DB status for `completed` or `expired`
- Remember DB is audit/backup, not a recovery source for public use

## Current Scope

The data model allows `CheckoutAction.UpdateSubscription`, but the public handlers currently only support `attach`.

If you extend Autumn checkout beyond attach, update:

- checkout creation
- public handlers
- preview/response shaping
- middleware assumptions
- any skill docs that still describe attach-only behavior
