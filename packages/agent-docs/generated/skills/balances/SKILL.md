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

Billing controls are runtime policy on a customer or entity: they never define what a plan grants, only how usage is allowed, capped, alerted, or topped up. They are often exposed as customer-facing settings, except `overage_allowed`, which is usually product/admin controlled.

- Only `overage_allowed` changes whether usage may pass 0. The rest just bound usage that is already permitted.
- `spend_limits`: caps overage only, in feature units (not dollars). With no overage there is nothing to bound, so it does nothing.
- `usage_limits`: a separate gate on TOTAL usage per time window, counted independently of the balance. This one bites whether or not overage exists, and can sit below the included amount. Useful when a plan grants multiple balances (5/day and 5/month) but the customer also needs a separate 100/month cap, or when shared credits need a per-action cap (10 `action_1` calls/day).
- `usage_alerts`: notify when usage crosses a threshold; alerts never block usage.
- `auto_topups`: automatically buy prepaid units when the balance drops below a threshold. Verify the feature has a one-off prepaid purchase path first.
- Entity-level controls override customer-level controls for that entity. Auto top-ups are customer-level only.
- Inspect current customer/entity state before changing billing controls.

Docs: [billing controls](https://docs.useautumn.com/documentation/customers/billing-controls), [auto top-ups](https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups), [spend limits and usage alerts](https://docs.useautumn.com/documentation/modelling-pricing/spend-limits).

### Tracking past zero

- On `track`, `overage_behavior` decides what happens to a deduction that does not fit.
- `cap` (default): deducts only what fits and stops at 0.
- `overflow`: deducts the whole value and lets the balance go negative. `usage_limits` do not clamp it; `spend_limits` still apply.
