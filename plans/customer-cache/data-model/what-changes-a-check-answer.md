---
author: john + claude
feature: customer-cache
date: 2026-09-29
status: research-in-progress
---

# What changes a check's answer

A check is the engine drawing `required_balance` through the subject's rows, dry-run, in reject
mode (`computeCheck.ts:9-22`). Everything below is an input to that draw. Paths: `BE` =
`packages/balance-engine/src`, `SH` = `shared/utils`.

## The draw, as one picture

```
check(messages, N=20, entity=user_7, props={model:"gpt-4"})
  rows   = user_7's rows first, then shared customer rows     sort:39-53
  bucket 1  unlimited row?  → absorbs everything, caps off    deduct.ts:14-25
  bucket 2  rollovers, soonest expiry first, down to 0
  bucket 3  each row's included balance, down to 0
  bucket 4  each row's overage, down to its floor (max_purchase
            or spend-limit headroom)
  every draw also capped by: min over matching usage caps
  allowed  = nothing left undrawn
```

## Entities: their cap is a separate meter, not a second balance

| scenario | result |
|---|---|
| customer row 1000 messages · user_7 cap 100/month, used 90 · check 20 for user_7 | refused, `usage_limit`: cap headroom 10 < 20, balance irrelevant |
| same, check 10 | allowed |
| customer row has 5 left · check 8 for user_7 | refused, `included` |
| customer cap 500 used 480 · user_7 has own cap · user_2 has none | user_7 ignores the 480 counter; user_2 draws it (headroom 20) |

- An entity's own cap **replaces** the customer's cap for that (feature, filter), and its usage
  never counts toward the customer counter (`SH/fullSubjectUtils/fullSubjectToUsageWindowLimits.ts:69-96`).
- A customer check never sees entity caps (`:46`).
- Spend limits are not counters: an entity inheriting the customer's spend limit gets the
  **whole** budget, measured over its own view of overage (`BE/deduction/utils/limits/spendLimit.ts:8-35`).
- A per-entity row stores each entity's balance in its `entities` map, on the **customer**
  part. An entity check draws its own key; a customer check draws every key in order
  (`BE/deduction/setup/resolveRowBounds.ts:51-61`).
- Other entities drawing a shared customer row change this entity's answer.

## Credits: the price of N units depends on who, how much, and which properties

| rate card on `action1` · 150 credits | properties | rate | check 10 |
|---|---|---|---|
| base 1 · `large {size:large}` 16 · `large_eu {size:large,region:eu}` 20 · `spot {lifecycle:spot}` ×0.5 | `{size:large,region:eu}` | 20 (most keys wins) | 200 → refused |
| | `{size:large,lifecycle:spot}` | 16 × 0.5 = 8 | 80 → allowed |
| | none | 1 (base) | 10 → allowed |

(`check-credit-dimensions.test.ts:64-89`; resolution `SH/featureUtils/creditDimensions/resolveCreditDimensionRate.ts:22-72`)

- **Graduated tiers depend on usage so far.** Tiers 0.01 / 0.008 / 0.005 per unit at 10k / 50k:
  after 9,950 units, 100 more cost 0.9 credits; at 0 used they cost 1.0
  (`track-graduated-credit-system.test.ts:139-197`). The position is `usage_attribution` per
  entitlement row and per dimension, cleared at reset (`BE/deduction/setup/resolveRowBounds.ts:107-111`).
- One check can draw from the feature's own rows **and** several credit pools; credits run
  before the feature's own overage (bucket 3 spans every row before bucket 4).
- A plan item can override the credit schema per entitlement (`entitlement.feature_override`).
- AI credit systems price tokens on the server before the engine sees them.

## Time changes the answer with no write

| boundary | engine behaviour |
|---|---|
| `next_reset_at` passed on a free / separately-reset prepaid row | refilled at the next command (`ensureSubjectCurrent.ts:7-22`) |
| same on a priced row | nothing until the `invoice.created` webhook |
| rollover or loose grant `expires_at` passed | dropped on read |
| usage window `window_end_at` passed | counter reads as 0 on read (`SH/usageWindowUtils/getCurrentUsageWindowUsage.ts:12-31`) |
| plan billing control outside `access_starts_at..ended_at` | control ignored |

## Everything else

- **Compiled from config:** flags; unlimited (disables all caps); `max_purchase` floor; the
  `overage_allowed` control (entity → customer → plan) can switch a row's overage on or off;
  past-due products dropped when `block_overdue_entitlements` is set or a threshold price exists;
  `customer.config.disable_pooled_balance` hides shared rows from entities.
- **Already reflected in balances:** open locks (their deltas are subtracted at lock time).
- **Only the server can answer:** `send_event`, `lock`, `with_preview`, unknown features,
  auto-create, AI token pricing.
- **The two paths disagree:** the legacy check evaluates one feature or one credit system; the
  engine splits a draw across sources. The React SDK's local check ignores caps, spend limits,
  tiers, dimensions, `billing_units` and entities.
