---
name: autumn-schedules
description: Setting up or changing a multi-phase schedule — how phases are timed, how a new call replaces the whole schedule, which params apply to the immediate phase, and what a phase can and cannot scope. Load when the request moves a customer between plans over time, or the customer already has a schedule.
---

# Schedules

## Schedules

- A schedule moves a customer between plans over dated phases. Create with `createSchedule`, preview with `previewCreateSchedule`.
- A customer holds ONE schedule. Calling `createSchedule` again replaces all of it — the old phases and their scheduled plans are deleted. There is no update or delete endpoint.
- To change a schedule, resend the full phase list, including phases that already started. To drop future phases, resend with only the immediate phase.
- Plans the schedule never placed (e.g. a separately attached add-on) are always kept.

### Phase timing

- Every phase needs exactly one of `starts_at` (epoch ms, or `"now"`) or `starting_after` (`{ duration_type: "month" | "year", duration_count }`).
- `starts_at: "now"` is first-phase only; `starting_after` is never allowed on the first phase.
- The first phase must start now. A future first `starts_at` is rejected. A past one works only for paid recurring plans on a customer with no existing Stripe subscription.
- `starts_at` values must be strictly increasing.
- Quirk: unless you pass `billing_cycle_anchor`, a later phase starting within 12 hours of the current billing cycle boundary is silently snapped onto that boundary.

### Plans in a phase

- `plans: [{ plan_id, entity_id?, feature_quantities?, version?, customize? }]`.
- At most one main plan per group and scope per phase; add-ons are exempt.
- `entity_id` sets scope: omit it to inherit the request entity, or pass `null` for customer-level. The first phase fixes the scope — later phases cannot change it.
- `customize` here rejects `free_trial` and license keys. Set a trial at the top level instead.
- `unscheduled_plans` bill with the immediate phase and are never expired or replaced by a later phase. It is an error for a phase to claim the same group and scope.

### Immediate-phase params

- `free_trial`, `currency`, `discounts`, `invoice_mode`, `billing_cycle_anchor: "now"`, and `redirect_mode` apply only to the immediate phase.
- `free_trial` applies to every recurring plan in that phase. `on_end: "revert"` is not supported on schedules.
- `billing_cycle_anchor: "phase_start"` on a later phase resets the Stripe billing cycle when that phase begins.
- `enable_plan_immediately: true` grants access while Stripe checkout is still pending. The response returns `status: "pending_payment"` with a null `schedule_id`, and the schedule persists once checkout completes.
- `no_billing_changes: true` writes the schedule in Autumn without touching Stripe.
