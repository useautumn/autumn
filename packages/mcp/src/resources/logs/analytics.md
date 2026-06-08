---
name: request-log-analytics
title: Request Log Analytics
description: How to aggregate external request-log activity.
priority: 0.8
audience:
  - assistant
---

# Request Log Analytics

Use queryRequestLogs for counts, grouping, and status-code summaries. Keep aggregates scoped by time range and avoid broad scans unless the user asks for organization-wide activity.

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
