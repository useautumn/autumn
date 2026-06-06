---
name: creating-plans
title: Creating Plans
description: How to gather plan details before using createPlan.
priority: 0.8
audience:
  - assistant
---

# Creating Plans

Use createPlan only after the requested plan shape is clear.

Before creating a plan, resolve:
- plan_id and name
- whether it is a base plan or add-on
- base price, interval, and currency if paid
- items/features, included quantities, reset intervals, and item-level prices
- free trial settings
- whether the plan should auto-enable for new customers

If the user names features but not exact ids, use listFeatures before drafting custom plan items. Never invent feature ids.

For consumable features, recurring grants need reset intervals. "500 credits per month" means included 500 with reset.interval "month"; one-time grants use "one_off".

For boolean features, include access without asking for quantity. For credit systems, grant the credit_system feature instead of each underlying metered feature.

If any required pricing or feature detail is ambiguous, ask a concise clarification question before creating the plan.
