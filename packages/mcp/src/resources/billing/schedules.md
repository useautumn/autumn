---
name: schedules
title: Billing Schedules
description: How to create multi-phase billing schedules safely.
priority: 0.8
audience:
  - assistant
---

# Billing Schedules

Use previewCreateSchedule and createSchedule for multi-phase future billing changes.

Before creating a schedule, resolve:
- customer_id and optional entity_id
- ordered phases with starts_at as UTC epoch millisecond timestamps
- plans in each phase, including versions, feature quantities, and customizations
- redirect_mode, success_url, invoice_mode, and checkout behavior if payment may be required

When using invoice_mode, usually set enable_plan_immediately true unless the user explicitly wants access to wait for payment.
invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing.

Use listFeatures only when a phase customizes plan items or sets non-zero prepaid feature_quantities and the exact feature ids or types are not already known. Scheduling an existing plan as-is does not need feature lookup.

Use the exact calendar date from the user or contract. Convert date-only schedule starts to midnight UTC unless the user or contract specifies a timezone. Do not shift years when converting dates.
When preview or response data includes starts_at or billing period timestamps, use epochMillisecondsToDate before explaining those timestamps to the user.

If the user says year 1 is already paid or should have no billing changes, do not create an immediate/year-1 phase with a null price or billing_behavior "none". Start the schedule at the first future billing change (for example year 2), then add later phases such as year 3.

Custom feature mapping:
- "N credits per month/year" -> customize.items[].included = N and reset.interval = "month"/"year".
- "unlimited X" -> customize.items[].unlimited = true.
- Omit reset only for non-consumable, unlimited, or clearly one-time grants.
- Credit systems should customize the credit_system feature, not each underlying metered feature.

There is no separate public update-schedule tool. For existing subscription changes, use previewUpdateSubscription and updateSubscription when the requested change fits that endpoint. For a new multi-phase transition, call previewCreateSchedule first, show the immediate billing impact and ordered phases, then call createSchedule only after explicit confirmation.
