---
name: request-log-customers
title: Request Log Customers
description: How to investigate one customer through the external request-log interface.
priority: 0.8
audience:
  - assistant
---

# Request Log Customers

Use customer_id as the primary filter when investigating one customer. Add entity_id when the customer has multiple entities and the user identifies one.

Start with a narrow recent range and list the customer's newest records:

```apl
where customer_id == 'cus_123' | order by timestamp desc | limit 25
```

Find failed calls for a customer:

```apl
where customer_id == 'cus_123' and status_code >= 400 | order by timestamp desc | limit 25
```

Build a mixed API and Stripe webhook timeline:

```apl
where customer_id == 'cus_123' | order by timestamp desc | limit 50
```

Narrow to one entity:

```apl
where customer_id == 'cus_123' and entity_id == 'ent_123' | order by timestamp desc | limit 25
```

When answering, state the time range, customer_id, optional entity_id, and whether matching records were API requests, Stripe webhooks, or both. If no records match, say that this log interface did not return matching records for the selected range.

