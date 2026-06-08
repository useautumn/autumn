---
name: request-log-stripe-webhooks
title: Request Log Stripe Webhooks
description: How to inspect public-safe Stripe webhook timelines through the external request-log interface.
priority: 0.8
audience:
  - assistant
---

# Request Log Stripe Webhooks

Use this resource for Stripe webhook timelines. Stripe webhook records are separated from normal API requests with source == 'stripe_webhook'.

Webhook fields:
- stripe_event_id
- stripe_event_type
- stripe_object_id

Recent Stripe webhooks for a customer:

```apl
where source == 'stripe_webhook' and customer_id == 'cus_123' | order by timestamp desc | limit 25
```

Webhook events by type:

```apl
where source == 'stripe_webhook' and customer_id == 'cus_123' | summarize events = count() by stripe_event_type | order by events desc | limit 20
```

Timeline for one Stripe object:

```apl
where source == 'stripe_webhook' and stripe_object_id == 'sub_123' | order by timestamp desc | limit 50
```

Inspect request_url, status_code, request_body, and response_body for what the webhook delivery returned. Do not ask for raw event payloads beyond the fields returned by this interface.
