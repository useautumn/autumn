## Balances, caps and overage

- A balance counts down to 0. Going below 0 is overage.
- Two things let usage go past 0, and nothing else does:
  - a usage-based `price` on the plan item — they go over and get billed for it.
  - the `overage_allowed` billing control.
- If neither is set, `included` IS the cap: usage stops at 0 and `check` returns `allowed: false`. Nothing extra is needed to enforce it.
- So never add a `spend_limit` to "cap" a feature that has no overage price and no `overage_allowed` — it is already capped, and the limit does nothing.

### How controls interact with balances

- Only `overage_allowed` changes whether usage may pass 0. The rest just bound usage that is already permitted.
- `usage_limits`: a separate gate on TOTAL usage per time window, counted independently of the balance. This one bites whether or not overage exists, and can sit below the included amount.

### Tracking past zero

- On `track`, `overage_behavior` decides what happens to a deduction that does not fit.
- `cap` (default): deducts only what fits and stops at 0.
- `overflow`: deducts the whole value and lets the balance go negative. `usage_limits` do not clamp it; `spend_limits` still apply.
