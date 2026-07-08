# Billing Investigations

Read this when investigating: unexpected or duplicate charges, plan changes (attach, upgrade, downgrade), cancellations, checkout, trials, invoices, or Autumn/Stripe subscription state drift.

## Contents

- Billing request paths
- Payload fields that matter
- The plan-change timeline recipe
- Classifying billing events
- Scenario recipes: duplicate charge, payment changed, cancel didn't happen, state drift

## Billing request paths

Billing activity is on RPC-style dotted routes; older orgs may also have REST-style calls.

| Action | RPC path | Legacy REST |
|--------|----------|-------------|
| Attach (new plan, upgrade, downgrade) | `/v1/billing.attach` | `/v1/billing/attach`, `/v1/attach` |
| Update (cancel, uncancel, quantity, custom terms) | `/v1/billing.update` | — |
| Multi-attach | `/v1/billing.multi_attach` | — |
| Setup payment method | `/v1/billing.setup_payment` | `/v1/billing/setup_payment` |
| Customer portal | `/v1/billing.open_customer_portal` | — |
| Schedules | `/v1/billing.create_schedule`, `/v1/billing.preview_create_schedule` | — |

Filter with `request_path contains 'billing'` to cover all of them, or a specific segment like `request_path contains 'billing.attach'`.

## Payload fields that matter

On billing records, inspect:

- `request_body`: plan/product ids, `feature_quantities`, `customize` (customer-specific terms), cancel action, timing fields.
- `response_body`: invoice id and status, `payment_url`, `required_action`, returned customer/entity ids.

Two response signals change how you read an attach:

- `response_body.payment_url` present → the customer was redirected to Stripe Checkout. The attach did **not** execute yet; look for a later `checkout.session.completed` webhook that completed it.
- A returned invoice with its status shows whether the charge succeeded immediately, was left draft, or required action.

## Plan-change timeline recipe

Build the timeline from both API-initiated changes and Stripe-side events, oldest first:

Pass A — find when billing activity happened:

```
where customer_id == 'cus_123' and (request_path contains 'billing' or source == 'stripe_webhook') | summarize events = count(), failed = countif(status_code >= 400) by bin(timestamp, 1d) | order by timestamp asc
```

Pass B — list the events in the active window(s):

```
where customer_id == 'cus_123' and (request_path contains 'billing' or source == 'stripe_webhook') | order by timestamp asc | limit 100
```

## Classifying billing events

| Record | Meaning |
|--------|---------|
| `billing.attach`, status 200, no `payment_url` | Plan change executed via API (new plan, upgrade, or downgrade) |
| `billing.attach`, status 200, with `payment_url` | Redirected to checkout — not executed; match with a later `checkout.session.completed` |
| `billing.update`, status 200 | Cancel/uncancel, quantity change, or custom-terms change — read `request_body` for intent |
| `stripe_event_type == 'checkout.session.completed'` | Checkout finished; a deferred attach executed here |
| `stripe_event_type == 'customer.subscription.updated'` | Renewal, payment failure/recovery, scheduled phase change, or cancel-at-period-end |
| `stripe_event_type == 'customer.subscription.deleted'` | Subscription fully ended |
| `stripe_event_type startswith 'invoice.'` | Invoice lifecycle — creation, finalization, payment |
| Billing call with `status_code >= 400` | Failed action — read `response_body` for the error; 402 means payment required/failed |

Changes made directly in the Stripe dashboard or billing portal never appear as Autumn API calls — only as the webhook deliveries they trigger. A timeline with subscription webhooks but no billing API calls means the change originated on the Stripe side.

## Scenario recipes

### "Customer was charged twice"

1. List billing calls and invoice webhooks around the charge time:

```
where customer_id == 'cus_123' and (request_path contains 'billing' or stripe_event_type startswith 'invoice.') | order by timestamp asc | limit 100
```

2. Repeated `billing.attach` calls with near-identical `request_body` close together suggest client-side retries; compare their `response_body` invoice ids to see which created charges.
3. Multiple `invoice.paid` webhooks for different invoice ids on the same day are separate charges — trace each `stripe_object_id` to what created it.

### "Why did their payment change this month?"

1. Run the plan-change timeline over the current and previous cycle.
2. Look for: an attach/update with different plan or quantities, a `checkout.session.completed`, a scheduled phase change in `customer.subscription.updated`, or a trial ending.
3. Compare `request_body.feature_quantities` and `customize` across attaches — custom terms and quantity changes are the usual silent causes.

### "They canceled but are still active" (or the reverse)

1. Find the cancel: `billing.update` with a cancel intent in `request_body`, or a portal cancellation arriving as `customer.subscription.updated`.
2. Cancel-at-period-end keeps the subscription active until the cycle ends — check current state for a scheduled cancelation before treating it as a bug.
3. If a `billing.update` cancel returned an error status, that is the cause — report the response error.

### "Autumn and Stripe are out of sync"

1. Fetch current Autumn state (`getCustomer`) and note the subscription/plan it shows.
2. Build the webhook timeline for the customer (see the Stripe webhooks reference). Find the last event that should have produced the expected state.
3. If that event's delivery shows `status_code >= 400`, Autumn received but failed to process it — report the failing delivery with its timestamp and event id, and escalate to Autumn support.
4. If the expected event never appears, Stripe may not have delivered it — the user should check the webhook attempts in their Stripe dashboard.
