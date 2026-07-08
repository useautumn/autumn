# Balance and Usage Investigations

Read this when investigating: denied checks (`allowed: false`), balance or credit discrepancies, usage totals, resets that didn't happen, rollovers, or 402/429 responses on check/track.

## Contents

- Balance request paths
- Response shapes: check, track, customer snapshot
- Status-code signals
- Scenario recipes: denied check, usage totals, missing reset, balance timeline, rollover drops

## Balance request paths

| Action | RPC path | Legacy REST |
|--------|----------|-------------|
| Check feature access | `/v1/balances.check` | `/v1/check`, `/v1/entitled` |
| Track usage | `/v1/balances.track` | `/v1/track`, `/v1/events` |
| Update balances directly | `/v1/balances.update` | `/v1/balances` |
| List/aggregate usage events | `/v1/events.list`, `/v1/events.aggregate` | — |

Cover both generations with a grouped filter:

```
where customer_id == 'cus_123' and (request_path contains 'balances.' or request_path contains 'check' or request_path contains 'track' or request_path contains 'entitled' or request_path contains 'events') | order by timestamp desc | limit 50
```

Add `entity_id == 'ent_123'` when the question is about one entity — a customer-level check and an entity-level check can legitimately differ, because entity balances are their own grants.

## Response shapes

### Check (`response_body`)

| Field | Meaning |
|-------|---------|
| `allowed` | The main signal — was access granted |
| `balance.granted`, `balance.remaining`, `balance.usage` | Metered/credit numbers at that moment |
| `balance.unlimited`, `balance.overage_allowed`, `balance.next_reset_at` | Modifiers on how remaining is enforced |
| `balance.breakdown` | Per-grant slices: included vs prepaid, each with its own reset/expiry |
| `balance.rollovers` | Rollover lines carried from previous cycles |
| `flag` | Boolean-feature result when there is no balance object |

### Track (`request_body` / `response_body`)

- `request_body`: `feature_id` or `event_name`, `value` (the deduction amount), `customer_id`, `entity_id`.
- `response_body`: the updated balance, or `balances` keyed by feature id when one event touches several features.

### Customer snapshot

`GET /v1/customers/...` responses carry `balances` (keyed by feature id) and `flags` — the best point-in-time snapshot to correlate against checks and tracks. Filter with `request_path contains 'customers'`.

## Status-code signals

| Code | Meaning on check/track |
|------|------------------------|
| 200 | Processed — a denial is `allowed: false` with status 200, not an error status |
| 402 | Insufficient balance to complete the tracked usage |
| 429 | Rate limited |

## Scenario recipes

### "Why was this check denied?"

1. Find the denials:

```
where customer_id == 'cus_123' and response_body.allowed == false | order by timestamp desc | limit 25
```

2. Read `balance.remaining`, `balance.next_reset_at`, and `breakdown` on the denial — they show which grant ran out and when it would have reset.
3. Walk backwards for the tracks that drained it (usage totals recipe below), and check current plan state for whether the feature is granted at all on their plan.

### "How much did they actually use?" (usage totals)

Aggregate tracked values by event over the window in question:

```
where customer_id == 'cus_123' and (request_path contains 'balances.track' or request_path contains 'track' or request_path contains 'events') | summarize tracked = sum(request_body.value), events = count() by request_body.event_name | order by tracked desc | limit 20
```

Compare the total against what the user believes was used or billed. To see *when* the usage happened, bucket it:

```
where customer_id == 'cus_123' and request_path contains 'track' | summarize tracked = sum(request_body.value) by bin(timestamp, 1d) | order by timestamp asc | limit 100
```

A large single-day spike, or tracks with unexpectedly large `value`s, usually explains "impossible" usage totals — list the raw records for that day to see the individual calls.

### "Their usage didn't reset this cycle"

1. Find checks straddling the expected reset boundary and compare `response_body.balance.next_reset_at` and `remaining` before vs after:

```
where customer_id == 'cus_123' and (request_path contains 'balances.check' or request_path contains 'check') | order by timestamp asc | limit 100
```

2. If `remaining` never returned to `granted` after `next_reset_at` passed, the reset observably did not apply — correlate with the renewal webhook (`customer.subscription.updated` / `invoice.paid`) around the boundary.
3. Resets are internal processing: the logs can show *that* balances didn't reset, not *why*. If state confirms it, report the evidence (timestamps, before/after balances) and escalate to Autumn support.

### Balance timeline

For "where did the credits go", list checks, tracks, and customer snapshots in order and read the balance trajectory from the payloads:

```
where customer_id == 'cus_123' and (request_path contains 'check' or request_path contains 'track' or request_path contains 'customers') | order by timestamp asc | limit 100
```

Project just the trajectory when the full payloads are noisy — note that `project` runs on `queryRequestLogs`:

```
where customer_id == 'cus_123' and request_path contains 'track' | project timestamp, feature = request_body.feature_id, value = request_body.value, remaining = response_body.balance.remaining | order by timestamp asc | limit 100
```

### "Their rollovers disappeared"

Compare `response_body.balance.rollovers` and `breakdown` across checks over time. Rollover drops usually coincide with a plan change — cross-reference the billing timeline reference for attaches or subscription updates at the same timestamp.
