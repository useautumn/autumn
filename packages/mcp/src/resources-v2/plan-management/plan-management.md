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

<rules>

- Use stable lowercase IDs with underscores, e.g. `pro_plan`, `chat_messages`.
- If the user lists many features, prioritize the core billable or metered features first and ask whether to model the rest now.
- If the user has given enough detail for a partial setup, prefer one direct question: create this draft now, or add missing features/limits first?
- Before creating plans, ask whether to create the current draft first or adjust it.
- Do not list the internal Autumn mapping unless the user asks how the setup maps to Autumn.

</rules>

<write-behavior>

</write-behavior>
