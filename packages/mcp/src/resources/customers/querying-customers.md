---
name: querying-customers
title: Querying Customers
description: How to answer customer-heavy questions with listCustomers.
priority: 0.8
audience:
  - assistant
---

# Querying Customers

listCustomers is the primary primitive for customer-heavy queries.

Prefer server-side filters before local filtering:
- search: customer id, name, or email
- plans: customers attached to specific plans and versions
- subscription_status: active or scheduled subscriptions
- processors: payment processor filters

Use limit 1000 for broad scans; that is the maximum page size.
Always paginate until next_cursor is empty when the user asks for complete results. Use getCustomer only for details not returned by listCustomers.

For operational billing requests, search by the customer name or email from the user or contract before saying customer_id is missing. If customer search does not resolve a match, ask for customer_id. If agent rules require entity-scoped billing, call listEntities with the resolved customer_id; if that does not resolve a match, ask for entity_id.
