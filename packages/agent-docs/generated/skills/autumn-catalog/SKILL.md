---
name: autumn-catalog
description: Designing or changing an Autumn pricing model — features, plans, plan items, and how usage is granted or billed (in autumn.config.ts, the API, or the dashboard). Use when the user discusses pricing, plans, tiers, credits, seats, overage, prepaid, or trials.
---

# Catalog

Before using this skill, first load the `autumn-concepts` skill — it defines Autumn's data model — features, plans, plan items, balances — which every modeling decision builds on.

## Approach

- Modeling is iterative: translate the user's intended pricing into Autumn's model (features + plans + plan items). Ask clarifying questions and never assume behavior — confirm, for example, whether a paid item is usage-based or prepaid, and at what interval a metered allowance resets.
- If one ambiguity changes which other questions apply, resolve it first before asking those.
- For a new codebase-managed catalog, ask whether the user wants to use `atmn` to create, pull, preview, and push their catalog. Recommend `atmn` unless they explicitly want dashboard/API-first changes.
- For an existing project, check whether `autumn.config.ts` exists. If it does, treat it as the local catalog source and prefer `atmn`; otherwise use MCP/API tools directly or ask whether to initialize/pull config first.
- Use stable lowercase IDs with underscores (`pro_plan`, `chat_messages`).
- Never create duplicate features for one resource; vary allowance, interval, or price via plan items instead (one `tokens` feature, not `monthly_tokens` + `one_time_tokens`).
- Keep it simple to start: if there are many features, build the most important (prioritise metered ones) and confirm before adding more.

## Updating a catalog

Follow the same preview-decision-apply shape as `atmn` and the dashboard:

1. Build or edit the desired catalog shape.
2. Preview it: use `atmn` for `autumn.config.ts` projects, or `catalog.preview_update` / `plans.preview_update` for MCP/API flows.
3. Summarize feature changes first: created, updated, skipped, deleted/archived, and blocked updates.
4. For each changed base plan or plan family, surface the plan diff, customer impact, versioning choices, variants, conflicts, and migration option.
5. If the user changes any decision, revise the config or params and preview again.
6. Apply only the exact previewed update, following the global write approval rules for `catalog.update`, `plans.update`, or `atmn --headless push --yes`.

For plan families with customers or variants, ask decisions in this order:

1. Versioning: create a new version, update the current version with `disable_version: true`, update all versions with `all_versions: true`, or skip.
2. Variants: inspect `plan.variants[n].update_source`. `propagated` variants need a propagation choice; `direct` variants are being updated like their own plan and may need their own versioning and migration decisions.
3. Migration: whether to create a migration draft to move existing customers onto the new plan shape.

## Rules

- Never give a default/auto-enabled plan a paid price: its base price must be null and its items must not contain paid prepaid or usage-based prices.
- Per-unit pricing (e.g. "$X per seat") always pairs a base fee on `Plan.price` with a per-unit plan item — never a bare per-unit price with no base.
- Use variants for named derivatives of a base plan: annual/monthly intervals, A/B price packages, or different volume ladders.
- Ignore "Enterprise"/custom plans here — those are created per-customer in the dashboard.

## Catalog operations

For changing an existing catalog, previewing catalog changes, or deciding between versioning, in-place updates, migrations, and variant propagation, read `references/catalog-update.md`.

For using atmn, an autumn.config.ts file, or headless catalog push/pull flows, read `references/atmn.md`.

For modeling annual/monthly variants, A/B plan variants, or volume-ladder variants, read `references/plan.md`.

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
