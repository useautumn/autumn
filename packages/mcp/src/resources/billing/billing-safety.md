---
name: billing-safety
title: Billing Safety and Customization
description: Shared rules for Autumn billing actions, previews, and plan customization.
priority: 0.8
audience:
  - assistant
---

# Billing Safety and Customization

Billing mutations must be preview-first and must carry the exact intended plan customization through preview and write.

- Use previewAttach before attach.
- Use previewUpdateSubscription before updateSubscription.
- Use previewCreateSchedule before createSchedule.
- Use previewCreateBalance before createBalance.
- Use createSchedule, not attach, for order forms with multiple years, phases, or future phase fees.
- Do not call a write tool to prepare a billing change. Call the matching preview tool, summarize the material billing impact, then apply only after explicit confirmation of that exact previewed change.
- For confirmed writes, preserve the exact previewed request unless the user asks to change it.
- If a contract gives enough information to build a reasonable billing preview, preview the inferred request instead of asking the user to confirm each inference first.
- Default paid billing changes should use a draft invoice: explicitly set enable_plan_immediately true and invoice_mode enabled true, enable_plan_immediately true, finalize false. Net terms do not imply finalize true. Only change if the user asks to finalize, charge, or pay now.
- Explicitly set redirect_mode if_required unless the user asks to force or disable checkout.
- If the user asks for a checkout link or session, omit invoice_mode, set redirect_mode always, and still set enable_plan_immediately true so access starts while payment is pending. Share the returned payment_url.
- If the contract says Net N payment terms, set invoice_mode.net_terms_days to N.
- invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing.
- Use listFeatures only when customizing plan items or passing non-zero prepaid feature_quantities and the required feature ids/types are not already known.
- Use createPlan only after the user confirms the plan configuration.
- Never claim a billing change was applied unless the write tool succeeds.

Custom plan mapping applies to attach, updateSubscription, and createSchedule:
- Keep commercial terms separate from entitlements: selected plan or phase fees go in plan.customize.price; add_items, remove_items, and update_items are only for feature entitlements.
- Year 1 / Year 2 fees in a 24-month order form are annual phase prices unless the contract says otherwise; do not ask for billing cadence.
- Matching the plan name is not enough when the contract lists fees, limits, or features that define the purchased package.
- Compare contract-listed features and limits to the selected base plan before previewing.
- Boolean feature additions use unlimited true, not included 1.
- "unlimited X" -> unlimited = true.
- Omit reset only for non-consumable, unlimited, or clearly one-time grants.
- Credit lines such as "5,000 per month" are often restating the selected base plan. If the base plan already has the same credit grant, reset, and overage rate, omit credits from customize entirely.
- Only customize credits when the contract differs from the base plan. Then set included = N, reset.interval = "month"/"year", and customize the credit_system feature, not each underlying metered feature.
- If a base-plan feature is missing from the contract package, use plan.customize.remove_items for that feature.
- If a contract-listed feature exists in the catalog but is not included in the base plan, use plan.customize.add_items for that feature.
- Do not ask the user to confirm add/remove feature deltas that follow directly from the listed contract package; put them in the preview for approval.
- Do not remove, re-add, or update a listed feature whose amount, reset, and price already match the selected base plan.
- Do not add proration, rollover, reset, or pricing fields to item patches unless the contract or requested change specifies them.
- Prefer patch-style add_items and remove_items for feature differences. Never combine customize.items with add_items, remove_items, or update_items.
- Use customize.items only when the contract fully replaces the plan item set.

Useful docs:
- https://docs.useautumn.com/api-reference/billing/attach
- https://docs.useautumn.com/documentation/concepts/plan-items
- https://docs.useautumn.com/documentation/customers/balances
