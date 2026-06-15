---
name: feature-catalog
title: Feature Catalog
description: How to use Autumn features when configuring plans and billing changes.
priority: 0.8
audience:
  - assistant
---

# Feature Catalog

Use listFeatures only when a task needs feature-specific inputs: creating plan items, customizing plan items, or passing non-zero feature_quantities for prepaid features. Ordinary billing changes that attach or update an existing plan as-is do not need feature lookup. Never invent feature ids.

Feature fields:
- id: stable feature id used in plan items, /check, and /track.
- name: human-readable name; match user language to this, then use id in tool calls.
- type: boolean, metered, or credit_system.
- consumable: for metered features, true means usage resets periodically; false means persistent allocation such as seats or storage.
- event_names: events that can increment usage for a metered feature.
- credit_schema: for credit_system features, maps underlying metered feature ids to credit costs.
- archived: avoid archived features unless the user explicitly asks for them.

Plan and billing usage:
- Attaching or updating an existing plan as-is usually does not need listFeatures.
- If a plan contains prepaid features and the request needs a non-zero quantity, use feature_quantities and know the feature_id.
- Boolean feature: include or remove access; do not ask for quantity.
- Metered consumable feature: ask for included amount or unlimited, and the reset interval unless it is clearly one-time.
- Metered non-consumable feature: ask for quantity or unlimited; do not add a reset interval.
- Credit system: grant the credit_system feature, not each underlying metered feature.
- Prepaid quantity changes belong in feature_quantities; custom contract grants or item-level prices belong in customize.

Follow Billing Safety for endpoint-specific customize semantics such as patch-style add_items/remove_items versus full customize.items replacement.

Useful docs:
- https://docs.useautumn.com/documentation/pricing/features
- https://docs.useautumn.com/documentation/pricing/plan-features
- https://docs.useautumn.com/documentation/modelling-pricing/prepaid-pricing
- https://docs.useautumn.com/documentation/modelling-pricing/credit-systems
