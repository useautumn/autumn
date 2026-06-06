---
name: request-logs
title: Request Logs
description: How to query tenant-scoped Autumn API request logs.
priority: 0.8
audience:
  - assistant
---

# Request Logs

Use request-log tools to investigate Autumn API requests and Stripe webhook deliveries for the authenticated organization. Treat this as the complete log interface. Do not ask for information outside the documented fields.

Use searchRequestLogs when the user needs matching request records:
- failed calls for a customer
- recent calls to a path
- request or response payload inspection
- a chronological list of relevant requests

Use queryRequestLogs when the user needs aggregate statistics:
- count failed requests by path
- count requests by status code
- compare traffic across request methods
- summarize failures over a time range

Queryable fields:
- timestamp
- source
- status_code
- request_method
- request_url
- request_path
- request_body
- response_body
- org_id
- customer_id
- entity_id
- stripe_event_id
- stripe_event_type
- stripe_object_id

source is either api_request or stripe_webhook.

Nested payload fields can be queried with dot paths under request_body and response_body:
- request_body.feature_id
- request_body.event_name
- request_body.customer_id
- response_body.allowed
- response_body.balance.remaining

Only simple dot paths are supported. Do not use raw functions, brackets, or extraction syntax. For nested response_body fields, narrow by time range and customer, path, or status before filtering or grouping.

Supported query stages are where, order by, limit, summarize, and project. Use searchRequestLogs for where/order/limit list queries. Use queryRequestLogs for summarize/project aggregate queries.

Default raw searches to a narrow recent range. For count/aggregate queries, queryRequestLogs defaults to 30 days when the query filters customer_id and 15 days for org-scoped queries. Ask for a customer, path, source, or time range when the user gives no useful anchor and the query may scan broadly.

Do not reference fields outside this document. If a fact is not present in these fields, say that the log interface does not expose it.

Basic examples:

```apl
where customer_id == 'cus_123' and status_code >= 400 | order by timestamp desc | limit 25
```

```apl
where request_path startswith '/v1/billing' and status_code >= 400 | limit 20
```

```apl
summarize requests = count() by source, request_path | order by requests desc | limit 20
```

```apl
where customer_id == 'cus_123' and request_body.feature_id == 'credits' | summarize requests = count() by request_body.event_name | order by requests desc | limit 20
```

```apl
where request_path contains 'balances.check' and response_body.allowed == false | summarize denied = count() by request_body.feature_id | order by denied desc | limit 20
```

When answering in Slack, include:
- the time range used
- the filters or grouping used
- the most relevant findings in short bullets
- any uncertainty, such as no matching logs or a range that may be too narrow

Never describe this interface as public API documentation.
