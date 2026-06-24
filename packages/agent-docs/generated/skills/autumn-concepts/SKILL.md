---
name: autumn-concepts
description: Modeling Autumn pricing or reasoning about features, plans, plan items, customers/entities, trials, or billing controls.
---

Use these definitions as the mental model when designing or changing Autumn
pricing. Reason in terms of features, plans, plan items, customers/entities, and
billing controls before writing any config or calling the API — most modeling
mistakes come from conflating a feature with a plan item, or a plan-level price
with a per-feature price.

For modeling plan items, or when you need concrete API request-body examples (included usage, prepaid, usage-based, tiers), read `references/plan-items.md`.
