---
name: autumn-investigate
description: Investigating Autumn request logs and Stripe webhook deliveries — debugging unexpected charges, plan-change history, denied feature checks, balance and usage discrepancies, failed API calls, and out-of-sync subscriptions. Use when the user asks why something happened to a customer — a charge, a state change, a denied check, missing or unreset usage — or wants to see a customer's request timeline or log analytics.
---

# Investigate

Before using this skill, first load the `autumn-concepts` skill — it defines Autumn's data model — customers, entities, plans, balances, subscriptions — which every finding must be explained in terms of.

## Goal

- Answer "what happened and why" using two sources: current account state (customer, plan, balance lookup tools) and the request-log interface (`searchRequestLogs`, `queryRequestLogs`).
- End with a conclusion the user can act on: a timeline of what happened, the cause when the logs show it, and a clear statement of what the logs cannot show when they don't.
- Logs record API requests and Stripe webhook deliveries — each entry is one request with its payload and response. They do not expose Autumn's internal processing, so conclusions must come from observable requests, responses, and state.

## Workflow

You MUST follow this order for every investigation.

1. **Anchor the investigation.** Resolve three things before querying logs:
   - *Who*: a `customer_id` (resolve names or emails with customer lookup tools), plus `entity_id` if the customer uses entities and one is identified.
   - *When*: an explicit time window. Convert relative phrasing ("this month", "since their renewal") into concrete dates before querying.
   - *What*: the expected vs. actual behavior, in one sentence. "Customer was charged twice; expected once."
   If the user gave no customer and no path scope, ask one concise question for the missing anchors instead of scanning broadly. Ask all missing anchor questions together.
2. **Check current state first.** `getCustomer` (balances, subscriptions, invoices) often answers "what is" instantly; logs answer "what happened". For discrepancy reports, fetch state first so you know what the timeline must explain.
3. **Locate the incident window.** Run one cheap `queryRequestLogs` aggregate bucketed with `bin(timestamp, ...)` to find *when* the relevant activity happened (see Two-pass pattern). Never start with a broad record listing.
4. **Drill into the window.** Use `searchRequestLogs` with a narrow range around the buckets that matter, and inspect `request_body` / `response_body` on the returned records.
5. **Load the matching domain reference** (below) before drilling into billing, balance, or webhook specifics — each defines the paths, payload fields, and scenario recipes for its domain.
6. **Report.** Lead with the answer, then a short timestamped timeline, then the time range and filters used, then any uncertainty.

## Two-pass pattern

Heavy list queries over wide ranges waste calls and truncate. Locate first, then inspect.

**Pass A — locate (queryRequestLogs).** Bucket counts over the widest allowed range:

```
where customer_id == 'cus_123' | summarize failed = countif(status_code >= 400), total = count() by bin(timestamp, 1d) | order by timestamp desc
```

**Pass B — inspect (searchRequestLogs).** Bound the range to the interesting bucket(s), list full records:

```
where customer_id == 'cus_123' and status_code >= 400 | order by timestamp desc | limit 50
```

If Pass A returns nothing, widen the range or change the predicate — do not run Pass B blind. If Pass A surfaces several windows, run Pass B once per window.

## Tool selection and ranges

- `searchRequestLogs` — returns matching request records with full payloads. Stages: `where`, `order by`, `limit`. Range is capped at **7 days per call** and defaults to only **30 minutes**, so always pass an explicit `range`.
- `queryRequestLogs` — returns aggregate rows. Stages: `where`, `summarize`, `project`, `order by`, `limit`. Range is capped at **30 days** when the query filters `customer_id`, **15 days** otherwise; it defaults to the cap.
- `limit` is capped at 200 on both. To cover more than 7 days of records, page `searchRequestLogs` through consecutive windows — or better, aggregate with `queryRequestLogs` and only list the windows that matter.

## Query language

Queries use a restricted pipeline syntax. Treat this section as the complete grammar — anything not listed here is rejected.

- Stages, joined by `|`: `where`, `summarize`, `project`, `order by <field> asc|desc`, `limit <n>`.
- Predicates: `==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `startswith`, `in ('a', 'b')`, combined with `and` / `or` and parentheses. String literals use single quotes.
- Aggregations (each needs an alias, e.g. `total = count()`): `count()`, `countif(<predicate>)`, and `sum` / `avg` / `min` / `max` / `percentile` over `status_code` or a numeric `request_body.*` / `response_body.*` path.
- Grouping: `by <field>, ...` on any field, a `request_body.*` / `response_body.*` dot path, or `bin(timestamp, <interval>)` with intervals like `15m`, `1h`, `6h`, `1d`.
- Nested payload access: dot paths under `request_body` and `response_body` only, at most 4 segments (`response_body.balance.remaining`). No brackets, functions, comments, or raw APL.

Queryable fields:

- `timestamp`, `source`, `status_code`
- `request_method`, `request_url`, `request_path`, `request_body`, `response_body`
- `org_id`, `customer_id`, `entity_id`
- `stripe_event_id`, `stripe_event_type`, `stripe_object_id`

`source` is `api_request` (paths under `/v1`) or `stripe_webhook` (Stripe webhook deliveries). Filtering `request_body contains '...'` or `response_body contains '...'` matches against the JSON text of the whole payload — useful when the exact field path is unknown.

Do not reference fields outside this list. If a fact is not in these fields, say the log interface does not expose it.

Frequent mistakes the endpoint rejects:

- Free text or `*` as the whole query. There is no full-text search — filter with `where request_body contains 'text' or response_body contains 'text'`.
- Invented fields like `body`, `feature_id`, or `status`. Use the listed fields, or a dot path such as `request_body.feature_id`.
- `summarize` or `project` sent to `searchRequestLogs` — aggregate stages only run on `queryRequestLogs`.
- Ranges beyond the cap. Split long periods into consecutive windows instead of retrying with the same range.

## Rules

- Always pass an explicit `range` — the search default of 30 minutes silently misses almost everything.
- Prefer structured filters (`customer_id`, `request_path`, `stripe_event_type`, `status_code`) over payload `contains` scans; use `contains` only to discover where a value appears, then switch to a precise filter.
- One filter change at a time. When a query returns nothing, loosen exactly one constraint (range, then path, then predicate) so you know which one hid the records.
- Distinguish *no matching records* from *proof of absence*: say which range and filters returned nothing, and offer to widen.
- Never present an internal-processing guess as a finding. The logs show requests, responses, and webhook deliveries — if the explanation requires Autumn's internal state (background jobs, cache, processing errors), say so and suggest the user contact Autumn support with the customer ID and time window.
- Never describe this interface as public API documentation, and do not invent endpoints from it.

## Domain references

For investigating charges, invoices, plan changes, upgrades or downgrades, cancellations, checkout, trials, or Autumn/Stripe subscription state drift, read `references/billing-timeline.md`.

For investigating denied checks, balance or credit discrepancies, usage tracking, usage totals, resets, rollovers, or 402/429 responses, read `references/balances-usage.md`.

For investigating Stripe webhook deliveries, subscription lifecycle events, payment failures, or building a customer timeline from Stripe's perspective, read `references/stripe-webhooks.md`.

## Analytics

For org-wide questions, keep aggregates scoped by time range and avoid broad scans unless asked.

Failed requests by path:

```
where source == 'api_request' and status_code >= 400 | summarize failed = count() by request_path | order by failed desc | limit 20
```

Status-code breakdown over time:

```
summarize requests = count() by status_code, bin(timestamp, 1d) | order by timestamp desc | limit 100
```

Most active customers:

```
where source == 'api_request' | summarize requests = count() by customer_id | order by requests desc | limit 20
```

## Reporting

- Lead with the conclusion, in the user's terms — not query mechanics.
- Follow with a short timeline: timestamp, what happened, which request or webhook shows it.
- State the time range and filters used so the user can trust the scope.
- Include amounts, plan names, and statuses from the payloads when they carry the finding.
- Flag uncertainty explicitly: ranges that may be too narrow, gaps the interface cannot see, or ambiguous records.
