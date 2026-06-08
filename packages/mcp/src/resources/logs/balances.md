---
name: request-log-balances
title: Request Log Balances
description: How to inspect balance, check, and track requests through the external request-log interface.
priority: 0.8
audience:
  - assistant
---

# Request Log Balances

Use this resource for questions about checks, tracking, usage events, balances, credits, and whether a customer was allowed to use a feature. Many customers use RPC-style routes with dotted names, while older REST-style routes are legacy.

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

Inspect request_body and response_body for feature ids, event names, allowed, balance, remaining, usage, granted, and next reset fields. Prefer dot-path filters such as request_body.feature_id and response_body.balance.remaining after narrowing by customer, path, and time range.
