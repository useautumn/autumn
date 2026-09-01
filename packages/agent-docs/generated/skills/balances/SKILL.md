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
- `spend_limits`: caps overage only, in feature units. With no overage there is nothing to bound, so it does nothing.
- `usage_limits`: a separate gate on TOTAL usage per time window, counted independently of the balance. This one bites whether or not overage exists, and can sit below the included amount.
- `usage_alerts`: notify only, never blocks.
- `auto_topups`: buy more prepaid units when the balance drops below a threshold.
- `spend_limits`, `usage_limits` and `overage_allowed` can be set on the plan, the customer, or the entity; the strictest setting wins. Auto top-ups are customer-level only.

### Tracking past zero

- On `track`, `overage_behavior` decides what happens to a deduction that does not fit.
- `cap` (default): deducts only what fits and stops at 0.
- `overflow`: deducts the whole value and lets the balance go negative. `usage_limits` do not clamp it; `spend_limits` still apply.
