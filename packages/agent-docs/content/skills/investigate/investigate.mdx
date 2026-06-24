---
name: autumn-investigate
description: Investigating Autumn API request logs and Stripe webhook deliveries — finding failed calls, customer request timelines, balance checks and tracking, billing calls, and request-log analytics. Use when the user wants to debug a request, see what happened for a customer, or analyze logs.
---

# Logs

Use this resource for log investigations: Autumn API requests, Stripe webhook deliveries, customer timelines, balance checks and tracking, billing calls, and request-log analytics.

Treat this as the complete log interface. Do not ask for information outside the documented fields.

## Tool Selection

Use `searchRequestLogs` when the user needs matching request records:
- failed calls for a customer
- recent calls to a path
- request or response payload inspection
- a chronological list of relevant requests

Use `queryRequestLogs` when the user needs aggregate statistics:
- count failed requests by path
- count requests by status code
- compare traffic across request methods
- summarize failures over a time range

## Queryable Fields

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

`source` is either `api_request` or `stripe_webhook`.

Nested payload fields can be queried with dot paths under `request_body` and `response_body`:
- request_body.feature_id
- request_body.event_name
- request_body.customer_id
- response_body.allowed
- response_body.balance.remaining

Only simple dot paths are supported. Do not use raw functions, brackets, or extraction syntax. For nested `response_body` fields, narrow by time range and customer, path, or status before filtering or grouping.

Supported query stages are `where`, `order by`, `limit`, `summarize`, and `project`. Use `searchRequestLogs` for `where` / `order by` / `limit` list queries. Use `queryRequestLogs` for `summarize` / `project` aggregate queries.

Default raw searches to a narrow recent range. For count/aggregate queries, `queryRequestLogs` defaults to 30 days when the query filters `customer_id` and 15 days for org-scoped queries. Ask for a customer, path, source, or time range when the user gives no useful anchor and the query may scan broadly.

Do not reference fields outside this document. If a fact is not present in these fields, say that the log interface does not expose it.

## Basic Examples

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

When answering, include:
- the time range used
- the filters or grouping used
- the most relevant findings in short bullets
- any uncertainty, such as no matching logs or a range that may be too narrow

Never describe this interface as public API documentation.

## Customer Investigations

Use `customer_id` as the primary filter when investigating one customer. Add `entity_id` when the customer has multiple entities and the user identifies one.

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

When answering, state the time range, `customer_id`, optional `entity_id`, and whether matching records were API requests, Stripe webhooks, or both. If no records match, say that this log interface did not return matching records for the selected range.

## Balance, Check, and Track Requests

Use this section for questions about checks, tracking, usage events, balances, credits, and whether a customer was allowed to use a feature. Many customers use RPC-style routes with dotted names, while older REST-style routes are legacy.

Relevant request paths usually include:
- /v1/balances.check
- /v1/balances.track
- /v1/balances.update
- /v1/balances.finalize
- /v1/events.list
- /v1/events.aggregate
- legacy: /v1/check, /v1/entitled, /v1/track, /v1/events, /v1/balances

Recent balance-related records for a customer:

```apl
where customer_id == 'cus_123' and (request_path contains 'balances.' or request_path contains 'events.' or request_path contains 'check' or request_path contains 'track' or request_path contains 'events' or request_path contains 'balances') | order by timestamp desc | limit 25
```

Failed balance-related calls:

```apl
where customer_id == 'cus_123' and status_code >= 400 and (request_path contains 'balances.' or request_path contains 'events.' or request_path contains 'check' or request_path contains 'track' or request_path contains 'events' or request_path contains 'balances') | order by timestamp desc | limit 25
```

Find checks that returned not allowed:

```apl
where customer_id == 'cus_123' and (request_path contains 'balances.check' or request_path contains 'check' or request_path contains 'entitled') and response_body.allowed == false | order by timestamp desc | limit 25
```

Feature activity for a customer:

```apl
where customer_id == 'cus_123' and (request_path contains 'balances.track' or request_path contains 'track' or request_path contains 'events') and request_body.event_name != '' | summarize requests = count() by request_body.event_name | order by requests desc | limit 20
```

Denied checks by feature:

```apl
where customer_id == 'cus_123' and (request_path contains 'balances.check' or request_path contains 'check' or request_path contains 'entitled') and response_body.allowed == false | summarize denied = count() by request_body.feature_id | order by denied desc | limit 20
```

Inspect `request_body` and `response_body` for feature ids, event names, allowed, balance, remaining, usage, granted, and next reset fields. Prefer dot-path filters such as `request_body.feature_id` and `response_body.balance.remaining` after narrowing by customer, path, and time range.

## Billing Requests

Use this section for billing attach, update, setup payment, customer portal, and schedule questions that can be answered from API request and response records. Billing activity is commonly on RPC-style dotted routes.

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

Inspect `request_body` and `response_body` for plan ids, product ids, checkout URLs, status codes, customer ids, entity ids, and returned billing results. If a user asks why a downstream payment provider changed state, use the Stripe webhook section to inspect webhook records too.

## Stripe Webhooks

Use this section for Stripe webhook timelines. Stripe webhook records are separated from normal API requests with `source == 'stripe_webhook'`.

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

Inspect `request_url`, `status_code`, `request_body`, and `response_body` for what the webhook delivery returned. Do not ask for raw event payloads beyond the fields returned by this interface.

## Analytics

Use `queryRequestLogs` for counts, grouping, and status-code summaries. Keep aggregates scoped by time range and avoid broad scans unless the user asks for organization-wide activity.

Requests by path:

```apl
where source == 'api_request' | summarize requests = count() by request_path | order by requests desc | limit 20
```

Failed requests by path:

```apl
where source == 'api_request' and status_code >= 400 | summarize failed = count() by request_path | order by failed desc | limit 20
```

Status-code breakdown:

```apl
summarize requests = count() by status_code | order by requests desc | limit 20
```

Customer activity:

```apl
where source == 'api_request' | summarize requests = count() by customer_id | order by requests desc | limit 20
```

Entity activity for one customer:

```apl
where customer_id == 'cus_123' | summarize requests = count() by entity_id | order by requests desc | limit 20
```

Tracked feature activity:

```apl
where source == 'api_request' and (request_path contains 'balances.track' or request_path contains 'track' or request_path contains 'events') and request_body.event_name != '' | summarize requests = count() by request_body.event_name | order by requests desc | limit 20
```

Check outcomes:

```apl
where source == 'api_request' and (request_path contains 'balances.check' or request_path contains 'check' or request_path contains 'entitled') | summarize allowed = countif(response_body.allowed == true), denied = countif(response_body.allowed == false) by request_body.feature_id | order by denied desc | limit 20
```

When answering, describe the grouping and time range. Do not infer product usage beyond the request paths and payload fields returned by this interface.
