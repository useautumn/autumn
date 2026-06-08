---
name: billing-safety
title: Billing Safety
description: Preview-first rules for Autumn billing changes.
priority: 0.8
audience:
  - assistant
---

# Billing Safety

Billing mutations must be preview-first.

- Use previewAttach before attach.
- Use previewUpdateSubscription before updateSubscription.
- Use previewCreateSchedule before createSchedule.
- Use previewCreateBalance before createBalance.
- Use createSchedule only after the user confirms the ordered phases, timing, and preview.
- When using invoice_mode, usually set enable_plan_immediately true unless the user explicitly mentions otherwise.
- invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing.
- Use listFeatures only when customizing plan items or passing non-zero prepaid feature_quantities and the required feature ids/types are not already known.
- Use previewAttach before attach, including feature_quantities, custom prices/items, reset intervals, discounts, and checkout behavior.
- Use createPlan only after the user confirms the plan configuration.
- Show the user the material billing impact before applying a change.
- Apply a write only after explicit confirmation of the exact previewed change.
- Never claim a billing change was applied unless the write tool succeeds.

Useful docs:
- https://docs.useautumn.com/api-reference/billing/attach
- https://docs.useautumn.com/documentation/concepts/plan-items
- https://docs.useautumn.com/documentation/customers/balances
