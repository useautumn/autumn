### Billing Controls

- Billing controls are policy on top of what a plan grants: they change how usage is capped, alerted, allowed past the balance, or topped up — never what the plan includes.
- They live at three levels: on a **plan** (defaults every subscriber inherits), on a **customer** (their own settings), and on an **entity** (per seat/workspace overrides). Plan-level controls are part of the catalog.
- Each control is a per-feature list entry: at most one entry per feature (usage limits: per feature + filter combination).

</intro>

<control-types>

- `usage_limits`: a hard cap over a time window, independent of balance — "1,000 emails a month, but never more than 200 a day". Fields: `feature_id`, `limit`, `interval` (`day`/`week`/`month`/`year`), optional `anchor` (`billing_cycle` default, or `utc` calendar windows), optional `filter` on event properties (only matching events count — the tool for capping one action inside a shared credit system, e.g. 10 `action_1` calls/day). The cap's window is independent of the allowance's reset cadence (a daily cap on a monthly grant), and an entity-level entry is how you cap one entity's draw on a pooled balance (100 shared credits, 10 per workspace).
- `spend_limits`: caps and controls **overage** for a feature. `overage_limit` is how much overage may accrue past the balance — in feature units (`limit_type: "absolute"`) or as a percent of the main-plan allowance (`limit_type: "usage_percentage"`). `skip_overage_billing: true` lets overage accrue but never invoices it.
- `usage_alerts`: notify at a threshold; never block. `threshold_type` is `usage`, `usage_percentage`, `remaining`, or `remaining_percentage`; `threshold` is a count for the absolute types, a percent otherwise. An escalation ladder of several alerts on one feature (80% / 100% / 120%) is normal — give each a `name`.
- `overage_allowed`: whether usage may continue past the granted balance at all. Enabled with no overage price = uncapped, unbilled overage; explicitly disabled = hard stop even where an overage price exists.
- `auto_topups`: automatically buy prepaid quantity when the balance drops below `threshold` — buys `quantity` units, optionally rate-limited by `purchase_limit` (N top-ups per hour/day/week/month) and `invoice_mode` (send an invoice instead of charging the card). Requires the feature to have a one-off prepaid purchase item on some plan. Customer and plan level only — never on entities. Repeated card failures suspend it and emit a `billing.auto_topup_failed` webhook.

</control-types>

<the-three-overage-knobs>

Three controls sound alike but answer different questions — conflating them is the common failure:

| Question | Knob |
|---|---|
| Can usage go past the balance at all? | `overage_allowed.enabled` |
| How far past? | `spend_limits.overage_limit` |
| Do we invoice what we let them incur? | `spend_limits.skip_overage_billing` |

Every overage behavior is a combination of the three:

| They want | The combination |
|---|---|
| Hard stop at the balance | nothing — the default when no overage price exists |
| Billed overage, up to a ceiling | `overage_limit` on top of the item's overage price |
| A free buffer past the grant, then stop | `enabled: true` + `skip_overage_billing: true` + `overage_limit` for the buffer size |
| Overage allowed, never billed, uncapped | `overage_allowed.enabled: true` with no overage price |
| End-user "bill me for overage" toggle | one spend-limits entry per state: toggle off = the free-buffer row; toggle on = `skip_overage_billing: false` (or drop the entry) |

**Where overage capability comes from — read the item, not the vibe.** When a plan item carries a usage-based price, overage capability ships on the plan: every subscriber can run past the grant and is billed at the item's rate, and controls only modulate that (`overage_limit` caps it, `skip_overage_billing` stops invoicing it). When the item is a pure grant (no usage price), zero balance is a hard stop by default; the capability must be granted per customer with `overage_allowed.enabled: true` — and because no price exists, that overage is **permitted, not billed**, so pair it with a `spend_limits.overage_limit` to cap how far the unbilled run goes. Billing the excess is a catalog decision (add a usage price to the item), not a billing-control one.

**The two percentage bases — the standing numeric trap.** A spend limit's `usage_percentage` measures the *overage* against the allowance: on 3,000 credits, `overage_limit: 20` = 300 units of headroom, 3,300 total — "20% over" is `20`, never `120`. An alert's `usage_percentage` measures *total usage*: `threshold: 120` fires at 3,600.

</the-three-overage-knobs>

<hierarchy>

- Plan-level controls are **inherited defaults**, resolved when access is checked — they are never copied onto the customer. Changing the plan's controls changes every subscriber that hasn't set their own.
- Precedence per feature: **entity > customer > plan**. A customer's entry for a feature shadows the plan's entry wholesale — there is no field-level merging.
- When several attached plans carry an entry for the same feature: the **most restrictive** wins for `usage_limits`, `spend_limits`, and `overage_allowed`; for `auto_topups` and `usage_alerts` the most recently attached plan wins.
- Customer API responses tag each control with its `source` (`plan` or `customer`) so you can tell an inherited default from an explicit setting.

</hierarchy>

<wire-shape>

Plan create/update and catalog params take `billing_controls` with the five snake_case lists:

```json
{
  "billing_controls": {
    "usage_limits": [{ "feature_id": "emails", "limit": 200, "interval": "day" }],
    "spend_limits": [{ "feature_id": "emails", "enabled": true, "overage_limit": 500 }],
    "usage_alerts": [{ "feature_id": "emails", "threshold": 80, "threshold_type": "usage_percentage" }],
    "overage_allowed": [{ "feature_id": "emails", "enabled": true }],
    "auto_topups": [{ "feature_id": "credits", "enabled": true, "threshold": 100, "quantity": 1000 }]
  }
}
```

In `autumn.config.ts` the same shape goes through the `billingControls()` builder on a plan. Updates replace per control list, not per entry — sending `usage_limits` replaces all usage limits, other lists untouched.

</wire-shape>

<agent-rules>

- Inspect current customer/entity state before changing runtime billing controls; check the plan's controls before assuming a customer needs their own.
- Prefer plan-level controls for anything true of every subscriber; reach for customer/entity entries only for per-customer exceptions.
- For auto top-ups, verify the feature has a one-off prepaid purchase path first.
- Alerts never block; spend limits are feature units (or percent), not dollars, unless the feature's units are dollars.

</agent-rules>

<useful-docs>

- Billing controls: https://docs.useautumn.com/documentation/customers/billing-controls
- Auto top-ups: https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups
- Spend limits and usage alerts: https://docs.useautumn.com/documentation/modelling-pricing/spend-limits

</useful-docs>
