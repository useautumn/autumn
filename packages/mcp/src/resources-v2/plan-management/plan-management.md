---
name: plan-management
title: Plan Management
description: How agents should help users configure, create, and update Autumn plans.
priority: 0.94
audience:
  - assistant
---

# Plan Management

Use this resource for plan-management queries: creating plans, configuring pricing, changing plan contents, modeling tiers, add-ons, trials, credit systems, prepaid quantities, or overage.

<user-interaction>

- Building pricing is iterative.
- The goal is to translate the user's intended pricing into Autumn's model: Features and Plans.
- Ask clarifying questions and never assume behavior unless the user explicitly states it.
- If one ambiguity changes which other questions apply, resolve it first on its own before asking the questions it governs.
  <examples>
  - Do not assume monthly credits reset with the base price interval; ask or state the needed reset interval.
  - Do not assume a paid plan item is usage-based or prepaid; ask unless the user's wording makes it explicit.
  </examples>

</user-interaction>

<workflow>

- Follow these steps in order; finish each before the next.
1. Overview: get the user's full pricing — every plan, what each includes, and prices. Digest it and agree how to model it in Autumn (see <modeling>).
2. Plans + plan-level config: create/update each plan with its base price, interval, and any trial — no feature items yet.
3. Paid features: add priced items (prepaid buckets / volume tiers + usage overage).
4. Metered features: add the remaining metered allowances and limits.
5. Boolean features: finalize on/off features per plan.
- At each step: if you have enough to take a confident stab, build it and surface it for confirmation; if not, ask until you do — then move on.
- To apply a step: `createPlan` if the plan doesn't exist yet, otherwise `updatePlan`. Before any `updatePlan`, call `hasCustomers` with the proposed plan and follow <versioning>.

</workflow>

<versioning>

- Versioning grandfathers existing customers on their current terms (a production concern) — e.g. raising the base price while keeping current customers on the old price.
- `hasCustomers` returns `will_version`: true when the change differs from the live plan AND the plan has customers, so a plain `updatePlan` would create a new version.
- Many updates should NOT version — e.g. adding or removing a boolean feature the user wants applied to all current customers. Apply those with `disable_version: true`.
- Rule of thumb: if there are no pricing changes (neither the base price nor any plan-item price), `disable_version: true` is safe and usually right.
- Also prefer `disable_version: true` when `will_version` is false, or in Sandbox with few customers (the user is likely still integrating, not in production).
- When there ARE pricing changes and the plan has customers, default to versioning (omit `disable_version`) and confirm with the user first.

</versioning>

<!-- Modeling -->

<rules>

- Use stable lowercase IDs with underscores, e.g. `pro_plan`, `chat_messages`.

</rules>
