---
name: billing
title: Billing
description: How agents should perform Autumn billing workflows.
priority: 0.94
audience:
  - assistant
---

# Billing

Use this resource for billing actions: attaching plans, updating subscriptions, creating schedules, canceling or uncanceling subscriptions, and changing customer billing state.
Read `autumn://docs/concepts` to understand Autumn's model: Customer, Entity, Plan, Subscription, Purchase, Balance, Flag, and Billing Controls.

<goal>

- Map the user's billing request to one or more Autumn billing API calls.
- Build the params for those calls before previewing.
- Gather requirements in natural language; do not force the user to speak in Autumn field names.
- Preview only when the params are complete enough to represent the intended billing action.

</goal>

<workflow>

- You MUST follow this checklist in order for every billing request.
- Resolve targets with <target-resolution>.
- Choose the operation with <action-selection>.
- Collect action-specific params with <param-checklist>.
- Resolve custom terms with <customizations>.
- Resolve timing with <timing-and-schedules>.
- Resolve invoice, checkout, and proration behavior with <billing-behavior>.
- If one ambiguity changes which of the other questions apply, resolve it first on its own before gathering the rest.
- Gather all remaining missing questions from the checklist and ask them together.
- If there are no missing questions, call the preview tool.
- Surface the preview and ask for the user's feedback or approval.
- If the user changes anything, update params and repeat from the relevant checklist step.
- If the user approves the preview, execute the exact previewed billing action.

</workflow>

<rules>

- **APPROVAL MUST BE GRANTED BEFORE PERFORMING ANY MUTATING BILLING ACTION.**
- Don't propose or promise steps outside what your tools can do. If the goal isn't reachable, say so plainly rather than inventing a workaround.
- Read this full resource before billing work and follow sections in order; later sections can define params that must be resolved before previewing.
- Monetary amounts are major currency units: `$1,150` -> `1150`, not `115000`.
- Slack billing requests usually expect immediate effect; use `plan_schedule: "immediate"` unless the user asks for end-of-cycle or future timing.
- If using `invoice_mode` and the customer has no email, ask for the email and call `updateCustomer` before previewing.
- Ask independent missing questions together in one concise message, using one bullet point per question.
- While gathering params, ask only for values needed to build the billing request; do not explain plan internals unless the user asks.

</rules>

<target-resolution>

- Resolve IDs from the user's message before choosing params: customer, optional entity, and plan(s).
- If preloaded `listPlans` / `listFeatures` results are present, treat them as already-run tool results. Do not call them again unless the needed record is absent or the user asks to refresh.
- Search remaining unknowns with the relevant lookup tools; run independent lookups in parallel.
- If the user gives explicit IDs, verify they exist with the same lookup tools.
- Do not create plans. If the customer or entity is missing, ask whether to create it.
- If an explicit customer/entity/plan ID is found, move on. For plans, a perfect or very close name match is enough only if it maps to exactly one plan.
- If sibling plans share a base name but differ by variant (e.g. `scale` vs `scale_yearly`), the name alone is not a match; ask which variant before previewing, especially for interval-specific or custom terms.
- If an ID had to be inferred from a name or description, confirm the match with the user before moving on.
- If the found customer has no email, remember that and ask for it before any invoice or checkout step.

</target-resolution>

<!-- Action selection -->

<param-checklist>

- After target resolution, collect the params specific to the selected action.
- Before previewing, resolve any required `customize` params identified in <customizations>.
- `attach`
  - If the plan has prepaid items and quantity is missing, ask for the quantity before previewing.
  - If the prepaid quantity is known, include `feature_quantities`. Undefined `feature_quantities` defaults to 0 for that feature.
  - `feature_quantities.quantity` is inclusive of the plan item's included amount. Example: if 5,000 credits are included and $10/100 credits after, passing 6,000 means only the extra 1,000 credits are charged.
- `updateSubscription`
  - If intent is ambiguous, clarify before previewing; e.g. cancel now vs cancel at end of cycle.
  - Quantity change: include `feature_quantities`.
  - Cancel or uncancel: include `cancel_action`.
  - Custom terms: include `customize`.
  - Version, trial, or discount change: include the matching fields. (less common intent)
- `createSchedule`
  - Build ordered `phases[]`.
  - Each phase needs timing (`starts_at` or `starting_after`) and at least one `plans[]` entry.
- If a missing value changes billing impact, ask before previewing.

</param-checklist>

<!-- Customizations -->

<!-- Timing and schedules -->

<!-- Billing behavior -->

<preview-and-approval>

- Preview only after action, target IDs, quantities, customization, timing, and billing behavior are known or intentionally defaulted.
- If missing information could change immediate charges, access timing, or scheduled state, ask before previewing.
- The main purpose of preview is to determine immediate billing impact: `total`, `currency`, and `line_items`.
- Summarize the preview before asking for confirmation.
- Lead with immediate impact: amount due now, no immediate charge, or credit.
- Include only preview facts that affect approval; avoid repeating context the user already resolved.
- If `next_cycle` exists, explain the next event: date, amount, and likely reason such as renewal, trial end, cancellation, downgrade, phase change, or nearest multi-interval event.
- Mention material state changes from `incoming` and `outgoing`, but treat them as supporting context if they look stale or incomplete.
- Convert preview timestamps before presenting dates.
- Apply only the exact previewed request. If params change, preview again.

</preview-and-approval>

<completion-response>

- After the billing action succeeds, respond as concisely as possible: say the action completed successfully.
- Surface any returned customer-facing URL, especially `payment_url` or `invoice.hosted_invoice_url`.
- If an `invoice` is returned, mention its `status`, `stripe_id`, and hosted URL when present.
- If `invoice.hosted_invoice_url` is missing but `invoice.stripe_id` exists, surface the Stripe dashboard invoice URL: sandbox `https://dashboard.stripe.com/test/invoices/{stripe_id}`, live `https://dashboard.stripe.com/invoices/{stripe_id}`.
- If `required_action` is returned, explain the required payment action and include `payment_url` if present.
- If the action fails, state that it failed and quote the server error/status clearly.
- Do not re-summarize the full preview after completion unless the user asks.

</completion-response>
