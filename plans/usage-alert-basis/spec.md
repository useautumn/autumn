# Usage alerts with a basis (usage limits, plan allowance, recurring)

## TL;DR

- Add one field to usage_alerts: `basis` — "what does 100% mean". Values: `balance` (default, today's behaviour), `included`, `recurring`, `usage_limit`. Only need `usage_limit` for today.
- Add an optional `filter` (same object as on usage limits) so a `usage_limit` alert can point at a filtered cap.
- No DB migration, no new tables, no changes to usage limits or the deduction Lua. Everything is additive with a backwards-compatible default.
- Webhook payload gains `usage_alert.basis` plus a `balance` or `usage_limit` block, so consumers can tell which 100% fired.

## Why not the alternatives

- Nest alerts inside `usage_limits[].alerts` — cleanest denominator story, but it gives alerts two homes. One home in `usage_alerts` wins.
- `interval` as the selector — works, but `(feature_id, filter)` is already a limit's identity. `interval` would be a second, redundant key that only matters if we ever stack caps.
- `filter.$basis` (reserved $-keys inside the filter) — a filter narrows which events count; basis changes what 100% means. `included` and `recurring` narrow the grant, not the events, so they can't live in a filter. Different axes, different fields.

## API shape — POST /customers/:id → billing_controls.usage_alerts[]

```json
{
  "feature_id": "emails",
  "threshold": 80,
  "threshold_type": "usage_percentage",
  "basis": "usage_limit",
  "filter": { "properties": { "api_key_id": "key_123" } },
  "name": "80% of daily cap"
}
```

## basis — what 100% means

| value | denominator | source on balance.breakdown |
|---|---|---|
| `balance` (default) | included + prepaid, all grants | `granted` — today's behaviour |
| `included` | plan allowance only, no top-ups | Σ `included_grant` |
| `recurring` | grants that reset, no one-offs | Σ (`included_grant` + `prepaid_grant`) where `reset != null` |
| `usage_limit` | the cap | `limit` on the matching usage limit |

## Rules

- Numerator is always the feature's total usage; only the denominator changes. `usage_limit` is the exception — it reads the usage-window counter.
- `usage_percentage` can exceed 100 (already allowed). `remaining = max(0, basis − usage)`.
- `filter` is only valid with `basis: "usage_limit"`. Balances have no filtered counters.
- `basis: "usage_limit"` resolves to the limit with the same `(feature_id, filter)` identity, via the existing entity → customer → plan inheritance.
- No matching limit resolves → alert is dormant, not an error. A plan can supply the limit later. (Product call — could also reject at update time.)
- Uniqueness within `usage_alerts`: `(feature_id, basis, filter, threshold_type, threshold)`.
- Same `threshold_type` enum everywhere: `usage | usage_percentage | remaining | remaining_percentage`.
- Named `included` rather than `plan` so it matches the breakdown field and keeps `plan` free for a future `plan_id` selector when plans stack.

Resend's config becomes:

```json
"usage_alerts": [
  { "feature_id": "emails", "threshold": 80, "threshold_type": "usage_percentage", "basis": "usage_limit" }
]
```

## Webhook — balances.usage_alert.triggered

Balance basis:

```json
{
  "customer_id": "cus_123",
  "feature_id": "emails",
  "usage_alert": {
    "name": "80% of plan",
    "threshold": 80,
    "threshold_type": "usage_percentage",
    "basis": "included"
  },
  "balance": { "usage": 1600, "granted": 2000, "included": 2000, "remaining": 400 }
}
```

Usage-limit basis:

```json
{
  "customer_id": "cus_123",
  "feature_id": "emails",
  "usage_alert": {
    "name": "80% of daily cap",
    "threshold": 80,
    "threshold_type": "usage_percentage",
    "basis": "usage_limit",
    "filter": { "properties": { "api_key_id": "key_123" } }
  },
  "usage_limit": {
    "limit": 200, "interval": "day", "anchor": "utc",
    "usage": 160, "remaining": 40,
    "window_start_at": 1788393600000, "window_end_at": 1788480000000
  }
}
```

Differentiate on `usage_alert.basis`. `usage_limit` block present ⇔ basis is `usage_limit`; `balance` block otherwise. Existing consumers that ignore both keep working.

Also add the same `usage_limit` block to `balances.limit_reached` so a daily block is distinguishable from anything else.

## Edge cases

- **Window rollover mid-track.** When we check alerts, we compare the customer's usage before the event with their usage after it. If a customer at 190/200 sends one email at 00:01 UTC, the daily window has just reset, so "before" is yesterday's 190 and "after" is today's 1. The check must not treat that as remaining jumping from 10 to 199 and fire a remaining alert; it should only compare before and after when both fall in the same daily window.
- **Must re-fire every day.** Resend hits 80% of the daily cap on Monday and again on Tuesday. Tuesday's webhook is intended and must go out, but today's dedup key is built only from the alert config, so it would see Tuesday as a duplicate of Monday and drop it. The key needs to include the window start time.
- **Limit resolves to nothing.** A customer has an 80% of usage_limit alert, but the 200/day cap came from a Pro plan they just cancelled, so there is no cap to measure against until they re-subscribe.
- **Limit disabled, alert enabled.** Someone toggles the 200/day cap off to unblock a customer but forgets the alert, which must go quiet rather than silently switching to 80% of the 2000 plan allowance.
- **Filter identity drift.** `{"key": 123}` vs `{"key": "123"}` — canonicalise the alert's filter with `usageLimitFilterKey` exactly as limits do, or they silently never match.
- **Entity vs customer counter.** Entity-owned limit → entity-scoped counter; customer-owned limit inherited by an entity → customer aggregate. The alert follows the limit's scope, not its own.
- **included = 0.** Customer on a top-up-only balance with a `basis: included` percentage alert. Skip, same as today's `granted <= 0` rule. Don't divide.
- **Recurring + one-off mix, deduction order.** `remaining` under `basis: recurring` assumes recurring grants drain first. If one-offs drain first, "remaining recurring" is a fiction. Define it as `max(0, basis − total_usage)` and document it.
- **Unlimited feature.** Balance alerts already skip these. A `usage_limit` alert on an unlimited feature is still meaningful — don't inherit the skip.
- **Bulk tracks.** One deduction of 50 can cross 80% and 100% at once. Today's crossing check fires both, which is correct — the window-counter path must do the same.
- **Legacy V1 postgres deduction** passes no FullSubject, so `usage_limit` alerts can't fire there. Log it.

## Files touched (~12 + UI + tests)

Schema
- `shared/models/cusModels/billingControls/usageAlert.ts` — basis enum, filter, the "filter only with usage_limit" check
- `shared/models/cusModels/billingControls/customerBillingControls.ts` — widen the dedup tuple
- `shared/api/billingControls/entityBillingControls.ts` — same dedup for entities (its usage-limit dedup is also missing filter-awareness today, fix both)

Webhook payload
- `shared/api/webhooks/balances/balancesUsageAlertTriggered.ts` — basis on usage_alert, optional balance / usage_limit blocks

Firing
- `server/src/internal/balances/trackWebhooks/checkUsageAlerts.ts` — basis-aware denominator, window-counter path, idempotency key. Most of the work.
- `server/src/internal/balances/trackWebhooks/fireTrackWebhooks.ts` — pass oldFullSubject / newFullSubject through so usage_windows survive the conversion

Reused untouched: `fullSubjectToUsageWindowLimits`, `getCurrentUsageWindowUsage`, `usageLimitFilterKey`, `getApiBalance` (breakdown is already built on every call).

Dashboard
- `vite/src/components/billing-controls/billingControlSheets.ts` — basis dropdown + filter input on the alert sheet
- `vite/src/components/billing-controls/BillingControlsDisplay.tsx` — show basis / filter on the row
- `vite/src/views/settings/sections/components/OrgUsageAlertDialog.tsx` — basis only; org alerts have no limit to point at, so exclude usage_limit
- `vite/src/views/products/plan/components/edit-plan-details/usePlanBillingControlForm.ts` — form state

Tests
- New: `usage-alert-basis.test.ts`, `usage-alert-usage-limit.test.ts` under `server/tests/integration/balances/track/usage-alerts/`
- Touched: `server/tests/integration/crud/customers/customer-billing-controls.test.ts` for the validation rules

Docs regenerate from the Zod schemas. The one thing outside this repo is autumn-js, if its generated types are checked in there.

## Open decision

Dormant vs reject when a usage_limit alert has no matching limit at update time. Recommendation: dormant, since plans can supply the limit later.
