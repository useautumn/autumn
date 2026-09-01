---
name: balances
description: How a balance behaves at zero — what makes an included allowance a hard cap, what lets usage go past it, and what billing controls actually do. Load when the request mentions a cap, limit, overage, or credit allowance, or the customer already has billing controls set.
---

# Balances

## Balances, caps and overage

- A balance counts down to 0. Going below 0 is overage.
- Two things let usage go past 0, and nothing else does:
  - a usage-based `price` on the plan item — they go over and get billed for it.
  - the `overage_allowed` billing control.
- If neither is set, `included` IS the cap: usage stops at 0 and `check` returns `allowed: false`. Nothing extra is needed to enforce it.
- So never add a `spend_limit` to "cap" a feature that has no overage price and no `overage_allowed` — it is already capped, and the limit does nothing.

### Billing controls

- Only `overage_allowed` changes whether usage may pass 0. The rest just bound usage that is already permitted.
- `usage_limits`: a separate gate on TOTAL usage per time window, counted independently of the balance. This one bites whether or not overage exists, and can sit below the included amount.

### Tracking past zero

- On `track`, `overage_behavior` decides what happens to a deduction that does not fit.
- `cap` (default): deducts only what fits and stops at 0.
- `overflow`: deducts the whole value and lets the balance go negative. `usage_limits` do not clamp it; `spend_limits` still apply.

### Billing Controls

- Billing controls are runtime policy on a customer or entity.
- They do not define what a plan grants; they change how usage is allowed, capped, alerted, or topped up.
- They are often exposed as customer-facing settings, except `overage_allowed` which is usually product/admin controlled.

</intro>

<control-types>

- `overage_allowed`: whether usage can continue after granted balance is exhausted.
- `spend_limits`: cap overage in feature units, not dollars.
- `usage_limits`: hard usage caps over a time window.
  - Useful when a plan grants multiple balances, e.g. 5/day and 5/month, but the customer also needs a separate 100/month cap.
  - Useful for credit systems when credits are shared, but one mapped action needs its own cap, e.g. 10 `action_1` calls/day.
- `usage_alerts`: notify when usage crosses a threshold; alerts do not block usage.
- `auto_topups`: automatically buy prepaid quantity when balance drops below a threshold.

</control-types>

<scope>

- Customer-level controls apply to the customer.
- Entity-level controls can override customer-level controls for that entity.
- Auto top-ups are customer-level only.

</scope>

<agent-rules>

- Inspect current customer/entity state before changing billing controls.
- For auto top-ups, verify the feature has a one-off prepaid purchase path.
- Do not describe alerts as blocking usage or spend limits as dollar limits unless the feature units are dollars.

</agent-rules>

<useful-docs>

- Billing controls: https://docs.useautumn.com/documentation/customers/billing-controls
- Auto top-ups: https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups
- Spend limits and usage alerts: https://docs.useautumn.com/documentation/modelling-pricing/spend-limits

</useful-docs>
