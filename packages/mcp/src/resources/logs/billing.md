---
name: request-log-billing
title: Request Log Billing
description: How to inspect billing requests through the external request-log interface.
priority: 0.8
audience:
  - assistant
---

# Request Log Billing

Use this resource for billing attach, update, setup payment, customer portal, and schedule questions that can be answered from API request and response records. Billing activity is commonly on RPC-style dotted routes.

Relevant request paths usually include:
- /v1/billing.attach
- /v1/billing.update
- /v1/billing.multi_attach
- /v1/billing.setup_payment
- /v1/billing.open_customer_portal
- /v1/billing.create_schedule
- /v1/billing.preview_create_schedule

Recent billing calls for a customer:

```apl
where customer_id == 'cus_123' and request_path contains 'billing' | order by timestamp desc | limit 25
```

Failed billing calls:

```apl
where customer_id == 'cus_123' and request_path contains 'billing' and status_code >= 400 | order by timestamp desc | limit 25
```

Attach or update timeline:

```apl
where customer_id == 'cus_123' and (request_path contains 'billing.attach' or request_path contains 'billing.update') | order by timestamp desc | limit 50
```

Billing activity by path:

```apl
where source == 'api_request' and request_path contains 'billing' | summarize requests = count(), failed = countif(status_code >= 400) by request_path | order by requests desc | limit 20
```

Inspect request_body and response_body for plan ids, product ids, checkout URLs, status codes, customer ids, entity ids, and returned billing results. If a user asks why a downstream payment provider changed state, use the Stripe webhook resource to inspect webhook records too.
