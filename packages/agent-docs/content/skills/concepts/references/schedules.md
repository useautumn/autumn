## Schedules

- A schedule moves a customer between plans over dated phases. Write it with `setPlans`, preview with `previewSetPlans`.
- `setPlans` sets the customer's plans in the request's scope (the customer, or the request's `entity_id`). The phases plus `unscheduled_plans` are the full list of plans it declares.
- A customer holds ONE schedule. Calling `setPlans` again replaces all of it — the old phases and their scheduled plans are deleted. There is no update or delete endpoint.
- To change a schedule, resend the full phase list, including phases that already started. To drop future phases, resend with only the immediate phase.

### Plans the request leaves out

- Always pass `undeclared_plans: "retain"` unless the user asks to end the plans the request does not list.
- `"retain"`: a current plan you leave out keeps running until a listed plan claims its group, e.g. a separately attached add-on stays.
- `"end"` (the default when omitted): every current plan in scope that you leave out ends now, with credit per `proration_behavior`. One-off purchases are never ended.
- Before writing, check the preview's `warnings` and outgoing plans. If it ends a plan the user did not ask to end, fix the request instead of writing it.

### Phase timing

- Every phase needs exactly one of `starts_at` (epoch ms, or `"now"`) or `starting_after` (`{ duration_type: "month" | "year", duration_count }`).
- `starts_at: "now"` is first-phase only; `starting_after` is never allowed on the first phase.
- To change plans on a future date, keep the current plan as the first phase starting now and put the new plan in a later phase.
- A future first `starts_at` ends the current plans in scope now and starts billing on that date. It cannot be combined with `free_trial`, `invoice_mode`, or `billing_cycle_anchor`.
- A past first `starts_at` works only for paid recurring plans on a customer with no existing Stripe subscription.
- `starts_at` values must be strictly increasing.
- Quirk: unless you pass `billing_cycle_anchor`, a later phase starting within 12 hours of the current billing cycle boundary is silently snapped onto that boundary.

### Plans in a phase

- `plans: [{ plan_id, entity_id?, feature_quantities?, version?, customize? }]`.
- At most one main plan per group and scope per phase; add-ons are exempt.
- `entity_id` sets scope: omit it to inherit the request entity, or pass `null` for customer-level. The first phase fixes the scope — later phases cannot change it.
- `customize` here rejects `free_trial` and license keys. Set a trial at the top level instead.
- `unscheduled_plans` bill with the immediate phase and are never expired or replaced by a later phase. It is an error for a phase to claim the same group and scope.

### Top-level params

- `free_trial`, `currency`, `discounts`, `invoice_mode`, `billing_cycle_anchor`, and `redirect_mode` apply only to the immediate phase.
- `free_trial` applies to every recurring plan in that phase. `on_end: "revert"` is not supported on schedules.
- `proration_behavior` (`"prorate_immediately"`, `"none"`, or `"bill_difference"`) controls the immediate phase's proration, the same field as attach and updateSubscription.
- `billing_cycle_anchor: "now"` resets the billing cycle now. A future epoch-ms timestamp moves the cycle to that date. It must not be after `ends_at`, or, on an existing subscription, after the next phase starts.
- `billing_cycle_anchor: "phase_start"` on a later phase resets the Stripe billing cycle when that phase begins.
- `ends_at` (epoch ms) ends the plans on that date and cancels the Stripe subscription then.
- With `invoice_mode.enabled: true`, also set `invoice_mode.finalize: false`, `redirect_mode: "if_required"`, and `enable_plan_immediately: true`. The tool rejects the request otherwise.
- `enable_plan_immediately: true` grants access while Stripe checkout is still pending. The response returns `status: "pending_payment"` with a null `schedule_id`, and the schedule persists once checkout completes.
- `no_billing_changes: true` writes the schedule in Autumn without touching Stripe.
