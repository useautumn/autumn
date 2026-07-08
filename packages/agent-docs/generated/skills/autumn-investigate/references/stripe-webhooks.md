# Stripe Webhook Investigations

Read this when investigating: subscription lifecycle (created, updated, deleted, past_due), invoice payment or failure, checkout completion, schedule changes, or building a customer timeline from Stripe's perspective.

## Contents

- Webhook records and fields
- Event types and what they imply
- Delivery vs processing
- Scenario recipes: past_due, object timeline, missing webhook, full customer timeline

## Webhook records and fields

Stripe webhook deliveries are log records with `source == 'stripe_webhook'`:

| Field | Meaning |
|-------|---------|
| `stripe_event_id` | The Stripe event (`evt_...`) — one per delivery |
| `stripe_event_type` | e.g. `customer.subscription.updated` |
| `stripe_object_id` | The object the event is about: subscription (`sub_...`), invoice (`in_...`), checkout session (`cs_...`), or schedule id |
| `status_code` | Autumn's processing response — `>= 400` means Autumn received the event but failed to process it |
| `request_body` | The delivered Stripe event payload |

## Event types and what they imply

| Event | Implication for the customer |
|-------|------------------------------|
| `customer.subscription.created` | New subscription started in Stripe |
| `customer.subscription.updated` | Status change: renewal, payment failure (`past_due`), recovery, cancel-at-period-end, or a scheduled phase activating |
| `customer.subscription.deleted` | Subscription fully canceled or expired — plan access ends |
| `invoice.created` / `invoice.finalized` | Upcoming charge being prepared (renewal or proration) |
| `invoice.paid` | Payment succeeded |
| `invoice.updated` | Invoice status or metadata changed — includes payment failures surfacing |
| `checkout.session.completed` | Customer finished Stripe Checkout; a pending plan attach executed here |
| `subscription_schedule.canceled` | A scheduled plan change was called off |
| `customer.discount.deleted` | A discount was removed |

Other event types are accepted with a 200 and have no effect.

## Delivery vs processing

These logs record deliveries that **reached Autumn**. Three distinct failure surfaces:

1. **Delivered and processed** — record with status 200. Normal.
2. **Delivered, processing failed** — record with `status_code >= 400`. Autumn's handling failed; report the event id, type, and time, and escalate to Autumn support.
3. **Never delivered** — no record at all. If an expected event is absent over the right range, the failure is upstream of Autumn: the user should check webhook attempts in their Stripe dashboard.

Say which of the three the evidence shows; they have different owners.

## Scenario recipes

### "Why did this subscription go past_due?"

Stripe fires invoice events before flipping subscription status. Pull both around the transition:

```
where customer_id == 'cus_123' and source == 'stripe_webhook' and (stripe_event_type startswith 'invoice.' or stripe_event_type startswith 'customer.subscription.') | order by timestamp asc | limit 100
```

An `invoice.created` / `invoice.finalized` without a following `invoice.paid`, then a `customer.subscription.updated`, is the payment-failure signature. The invoice payload in `request_body` carries the amount and attempt details.

### Timeline for one Stripe object

Everything that happened to a specific subscription, invoice, or checkout session:

```
where stripe_object_id == 'sub_123' | order by timestamp asc | limit 100
```

### "Autumn never reacted to something that happened in Stripe"

1. Establish the expected event type and rough time from what the user describes.
2. Check whether it arrived:

```
where customer_id == 'cus_123' and source == 'stripe_webhook' | summarize deliveries = count(), failed = countif(status_code >= 400) by stripe_event_type | order by deliveries desc | limit 20
```

3. Present: arrived and processed / arrived but failed processing / never arrived — with next steps per the Delivery vs processing section.

### Full customer timeline (API + webhooks)

The complete "what happened to this customer" view — every API call and webhook delivery in one ordered list:

```
where customer_id == 'cus_123' | order by timestamp asc | limit 100
```

Use `source` on each row to distinguish the customer's own API activity from Stripe-side events. Run Pass A first (`summarize ... by bin(timestamp, 1d)`) when the period of interest is longer than a search window.
