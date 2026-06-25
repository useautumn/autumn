---
name: autumn-catalog
description: Designing or changing an Autumn pricing model — features, plans, plan items, and how usage is granted or billed (in autumn.config.ts, the API, or the dashboard). Use when the user discusses pricing, plans, tiers, credits, seats, overage, prepaid, or trials.
---

# Catalog

Before using this skill, first load the `autumn-concepts` skill — it defines Autumn's data model — features, plans, plan items, balances — which every modeling decision builds on.

## Approach

- Modeling is iterative: translate the user's intended pricing into Autumn's model (features + plans + plan items). Ask clarifying questions and never assume behavior — confirm, for example, whether a paid item is usage-based or prepaid, and at what interval a metered allowance resets.
- If one ambiguity changes which other questions apply, resolve it first before asking those.
- Use stable lowercase IDs with underscores (`pro_plan`, `chat_messages`).
- Never create duplicate features for one resource; vary allowance, interval, or price via plan items instead (one `tokens` feature, not `monthly_tokens` + `one_time_tokens`).
- Keep it simple to start: if there are many features, build the most important (prioritise metered ones) and confirm before adding more.

## Rules

- Never give a default/auto-enabled plan a paid price: its base price must be null and its items must not contain paid prepaid or usage-based prices.
- Per-unit pricing (e.g. "$X per seat") always pairs a base fee on `Plan.price` with a per-unit plan item — never a bare per-unit price with no base.
- Variants (monthly vs annual, or two price points of one plan) are separate plans (`pro_monthly`, `pro_annual`); Autumn has no single "plan with variants".
- Ignore "Enterprise"/custom plans here — those are created per-customer in the dashboard.

## Pricing patterns

Load the matching reference when modeling that pattern.

For charging for usage beyond an included allowance (pay-in-arrears overage), read `references/usage-based-pricing.md`.

For selling a quantity bought upfront (seats, credit packs, selectable buckets), read `references/prepaid-pricing.md`.

For pricing that changes by volume tier, read `references/volume-based-tiers.md`.

For modeling $X per unit (seat, project) — always with a base fee, read `references/per-unit-pricing.md`.

For modeling several actions or endpoints that draw from one shared meter, read `references/credit-systems.md`.

For modeling a free or default plan, read `references/free-plans.md`.

For modeling a recurring subscription plan, read `references/recurring.md`.

For modeling one-off purchases or top-ups, read `references/one-off-purchases.md`.

For adding a trial to a plan, read `references/trials.md`.
