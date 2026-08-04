---
name: rewards
title: Rewards
description: How agents should list and create Autumn coupons and feature grants.
priority: 0.9
audience:
  - assistant
---

# Rewards

Rewards are either coupons or feature grants. Use `listRewards` to inspect existing rewards and confirm plan and feature IDs before creating one.

<rules>

- Send exactly one top-level field: `coupon` or `feature_grant`.
- Coupons support `percentage_discount` and `fixed_discount`. Fixed values use major currency units.
- Coupon `plan_ids: null` means all plans; otherwise provide one or more current plan IDs.
- `months` durations require a positive `length`; `one_off` and `forever` require `length: null`.
- Feature grants require at least one grant and promo code. Boolean features use `included: null`; metered and credit features require a positive amount.
- Reward IDs, promo codes, and feature IDs within a grant must be unique.

</rules>
