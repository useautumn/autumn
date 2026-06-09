---
name: schedules
title: Billing Schedules
description: How to create multi-phase billing schedules safely.
priority: 0.8
audience:
  - assistant
---

# Billing Schedules

Use previewCreateSchedule and createSchedule for multi-phase future billing changes. Follow Billing Safety for shared preview-first, invoice mode, and plan customization rules.

Before creating a schedule, resolve:
- customer_id and optional entity_id
- ordered phases with starts_at as UTC epoch millisecond timestamps
- plans in each phase, including versions, feature quantities, and customizations
- redirect_mode, success_url, invoice_mode, and checkout behavior if payment may be required

When an agreement gives different recurring fees for different periods, create one schedule phase per priced period and put each fee in that phase's plans[].customize.price. There is no top-level phase plan.price field for schedules; fees are commercial terms, not feature entitlements. Infer the price interval from the contract's period labels and term length unless the agreement states a different billing cadence.

Use the exact calendar date from the user or contract. If a provisioning request or signed order form has no effective/start date, use the current date for the first phase and state that assumption in the preview. Convert date-only schedule starts to midnight UTC unless the user or contract specifies a timezone. If the first phase starts now, pass the current date as epoch milliseconds; never pass literal "now" to createSchedule. Do not shift years when converting dates.
When preview or response data includes starts_at or billing period timestamps, use epochMillisecondsToDate before explaining those timestamps to the user.

If the user says year 1 is already paid or should have no billing changes, do not create an immediate/year-1 phase with a null price or billing_behavior "none". Start the schedule at the first future billing change (for example year 2), then add later phases such as year 3.

There is no separate public update-schedule tool. For existing subscription changes, use previewUpdateSubscription and updateSubscription when the requested change fits that endpoint. For a new multi-phase transition, call previewCreateSchedule first, show the immediate billing impact and ordered phases, then call createSchedule only after explicit confirmation.
