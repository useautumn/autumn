# Billing

Use this resource for billing actions: attaching plans, updating subscriptions, creating schedules, canceling or uncanceling subscriptions, and changing customer billing state.
Read `autumn://docs/concepts` to understand Autumn's model: Customer, Entity, Plan, Subscription, Purchase, Balance, Flag, and Billing Controls.

## Goal

- Map the user's billing request to one or more Autumn billing API calls.
- Build the params for those calls before previewing.
- Gather requirements in natural language; do not force the user to speak in Autumn field names.
- Preview only when the params are complete enough to represent the intended billing action.

## Workflow

- You MUST follow this checklist in order for every billing request.
- Read the org's agent rules with `getAgentRules` to understand how this org attaches plans to customers — its entity defaults, credit defaults, and org notes.
- Resolve targets (see Target resolution).
- Choose the operation (see Action selection).
- Collect action-specific params (see Param checklist).
- Resolve custom terms (see Customizations).
- Resolve timing (see Timing and schedules).
- Resolve invoice, checkout, and proration behavior (see Billing behavior).
- If one ambiguity changes which of the other questions apply, resolve it first on its own before gathering the rest.
- Gather all remaining missing questions from the checklist and ask them together.
- If there are no missing questions, call the preview tool.
- Surface the preview's immediate billing impact, then obtain approval via your client's approval mechanism.
- If params change, update them and repeat from the relevant checklist step.
- Once approved, apply the exact previewed billing action.

## Rules

- **A mutating billing action requires approval before it takes effect — obtain it via your client's approval mechanism.**
- Don't propose or promise steps outside what your tools can do. If the goal isn't reachable, say so plainly rather than inventing a workaround.
- Read this full resource before billing work and follow sections in order; later sections can define params that must be resolved before previewing.
- Monetary amounts are major currency units: `$1,150` -> `1150`, not `115000`.
- Slack billing requests usually expect immediate effect; use `plan_schedule: "immediate"` unless the user asks for end-of-cycle or future timing.
- If using `invoice_mode` and the customer has no email, ask for the email and call `updateCustomer` before previewing.
- Ask independent missing questions together in one concise message, using one bullet point per question.
- While gathering params, ask only for values needed to build the billing request; do not explain plan internals unless the user asks.
- If a customization is inferred, surface it for confirmation before previewing or writing. If its intent is ambiguous, ask before building — don't resolve it silently. When surfacing a customization, describe it as a patch (what was added/removed/changed vs the catalog plan), not a full restatement of every feature.
- If the user gives an included credit/feature amount and the plan has a prepaid item for that feature, clarify whether they mean the quantity or a customization of the item, unless it's clear.
- Before any trial action, re-read the Trials section in `autumn://docs/concepts`.
- Adding a trial for a customer who already has a paid subscription resets the Stripe billing cycle; warn the user and offer the `on_end: "revert"` flow, then let them choose.

## Target resolution

- Resolve IDs from the user's message before choosing params: customer, optional entity, and plan(s).
- If preloaded `listPlans` / `listFeatures` results are present, treat them as already-run tool results. Do not call them again unless the needed record is absent or the user asks to refresh.
- Search remaining unknowns with the relevant lookup tools; run independent lookups in parallel.
- If the user gives explicit IDs, verify they exist with the same lookup tools.
- Do not create plans. If the customer or entity is missing, ask whether to create it.
- If an explicit customer/entity/plan ID is found, move on. For plans, a perfect or very close name match is enough only if it maps to exactly one plan.
- If sibling plans share a base name but differ by variant (e.g. `scale` vs `scale_yearly`), the name alone is not a match; ask which variant before previewing, especially for interval-specific or custom terms.
- If an ID had to be inferred from a name or description, confirm the match with the user before moving on.
- If the found customer has no email, remember that and ask for it before any invoice or checkout step.

## Action selection

### Overview

- Usually choose `attach` or `updateSubscription`.
- Use `createSchedule` for multiple phases or when the request needs explicit control over future billing state.
- Use `attach` for a single plan attach even when it has `starts_at` or `ends_at`.
- Check the customer's existing subscriptions before choosing the action.

### attach

- Use when the customer/entity is not already on the target plan: new subscription, purchase, upgrade, downgrade, add-on, or one-off top-up.
- If they already have the target recurring plan, do not attach it again; use `updateSubscription`.
- One-off plans are always attached because each purchase/top-up is a new purchase.
- `attach` handles transitions: switching main plans expires the replaced plan, while add-ons are additive.
- Autumn determines upgrade vs downgrade from normalized base and prepaid prices.
- By default, `attach` tries to add the new plan to an existing Stripe subscription when possible; mid-cycle changes on that subscription can charge or credit prorations.
- Downgrades default to end-of-cycle scheduling through `plan_schedule`; upgrades usually apply immediately.

### updateSubscription

- Use when changing a plan the customer/entity is currently on.
- Main uses: prepaid feature quantity changes, cancel now/end-of-cycle, uncancel, custom plan edits, version/trial changes, and discounts.
- Use it for modifying the existing subscription state, not for moving to a different plan the customer is not on.

### createSchedule

- Use for explicit dated phases: contracts, future changes, multi-year pricing, or sequences like Pro for 6 months then Starter.
- Treat it like replacing the customer/entity's billing configuration for that scope with the listed phase states.
- The immediate phase previews like a transition from current state to the first phase, so prorations may apply.
- Each phase must still be valid: do not put two non-add-on main plans from the same group in one phase.
- Watch contracts for dates, year-by-year fees, ramps, delayed downgrades, or different packages over time.

### Notes

- Existing subscriptions decide `attach` vs `updateSubscription`; one-off plans are the main exception and are always attached.
- Preview responses describe the immediate billing impact: what is charged or credited now, plus future-cycle details when present.
- Schedules are explicit phase state. Use them when attach/update cannot express the required future configuration or level of control.

## Param checklist

- After target resolution, collect the params specific to the selected action.
- Before previewing, resolve any required `customize` params identified in Customizations.
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

## Customizations

- Use the `customize` object for customer-specific plan terms.
- Base price changes go in `customize.price`; e.g. if the user says Pro is $50/month but the catalog Pro plan is $20/month, customize the price.
- A bare number with an interval but no `$` and no unit (e.g. "1k/yr", "2k/mo") is ambiguous between `customize.price` and a feature quantity (credits/seats); clarify which before building the customize, and read the same pattern consistently across the request.
- A list of what a customer "gets" is ambiguous: restating the plan, adding on top, or the exact set (items not listed are removed/zeroed). If the reading changes what they receive vs the catalog plan, ask which before building.
- "Features" may mean only some items (e.g. booleans) or include credits/metered items; clarify scope before removing anything priced.
- Plan item changes are always PATCH-style: `customize.add_items` and `customize.remove_items` change selected items.
- Never use `customize.items` (PUT-style full replacement) or `update_items`. To make the plan's items the exact set, remove the unwanted ones with `remove_items` and add the missing ones with `add_items`.
- Each `remove_items` entry is a filter for items to remove from the plan.
- Include `billing_method`, `interval`, or `interval_count` in the filter when `feature_id` alone could match multiple items.
- Replace an item's configuration: remove the old item and add the new version in the same PATCH-style `customize`.
- When the same outcome can be expressed multiple ways, prefer the customization that preserves the catalog plan's existing item structure: same-shape customizations keep the customer consistent with others on the plan and with their existing update/quantity flows.

### Example

A plan prices `credits` as a prepaid, volume-tiered item (ladder `10k=$90, 50k=$400, inf=$700`). To give a customer 20k credits at a custom $150/mo, add a `20k=$150` tier into the existing ladder:

```json
{
  "customize": {
    "remove_items": [{ "feature_id": "credits", "billing_method": "prepaid" }],
    "add_items": [
      {
        "feature_id": "credits",
        "price": {
          "billing_method": "prepaid",
          "interval": "month",
          "tier_behavior": "volume",
          "tiers": [
            { "to": 10000, "flat_amount": 90 },
            { "to": 20000, "flat_amount": 150 },
            { "to": 50000, "flat_amount": 400 },
            { "to": "inf", "flat_amount": 700 }
          ]
        }
      }
    ]
  },
  "feature_quantities": [{ "feature_id": "credits", "quantity": 20000 }]
}
```

Note: the new tier is added into the plan's existing tiers — carry the whole ladder over; don't replace it with just the custom tier or a flat base price.

- If a plan name/id/context suggests an Enterprise or custom placeholder plan and the plan has no base price, and no commercial terms were specified, ask the user whether they want to customize the base price.

### Use cases

- `updateSubscription`: customize the plan configuration the customer is already on.
  ```json
  {
    "customer_id": "cus_123",
    "plan_id": "pro",
    "customize": { "add_items": [{ "feature_id": "sso" }] }
  }
  ```

- `attach`: attach a plan with customer-specific base price or item changes.
  ```json
  {
    "customer_id": "cus_123",
    "plan_id": "pro",
    "customize": {
      "price": { "amount": 50, "interval": "month" },
      "add_items": [{ "feature_id": "credits", "included": 5000 }]
    }
  }
  ```

- `createSchedule`: customize the plan inside the phase that needs custom terms.
  ```json
  {
    "customer_id": "cus_123",
    "phases": [
      { "starts_at": "now", "plans": [{ "plan_id": "pro" }] },
      {
        "starts_at": "2027-06-12T00:00:00Z",
        "plans": [
          {
            "plan_id": "pro",
            "customize": { "price": { "amount": 75, "interval": "month" } }
          }
        ]
      }
    ]
  }
  ```

### Examples

- Change base price:
  ```json
  { "customize": { "price": { "amount": 50, "interval": "month" } } }
  ```

- Add a boolean feature:
  ```json
  { "customize": { "add_items": [{ "feature_id": "sso" }] } }
  ```

- Remove a feature:
  ```json
  { "customize": { "remove_items": [{ "feature_id": "audit_logs" }] } }
  ```

- Change included amount:
  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits" }],
      "add_items": [{ "feature_id": "credits", "included": 5000 }]
    }
  }
  ```

- Change included amount and reset interval:
  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits" }],
      "add_items": [
        {
          "feature_id": "credits",
          "included": 5000,
          "reset": { "interval": "month" }
        }
      ]
    }
  }
  ```

- Change only the monthly item when the same feature also has a lifetime item:
  ```json
  {
    "customize": {
      "remove_items": [
        {
          "feature_id": "credits",
          "billing_method": "prepaid",
          "interval": "month"
        }
      ],
      "add_items": [
        {
          "feature_id": "credits",
          "included": 5000,
          "reset": { "interval": "month" }
        }
      ]
    }
  }
  ```

- Change prepaid to usage-based:
  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits" }],
      "add_items": [
        {
          "feature_id": "credits",
          "included": 0,
          "price": {
            "amount": 0.01,
            "interval": "month",
            "billing_method": "usage_based"
          }
        }
      ]
    }
  }
  ```

## Timing and schedules

### Default timing

- Do not set `starts_at` or `ends_at` unless the user gives a date, duration, backdate, future start, or explicit end date.
- If timing is ambiguous and affects billing impact, ask before previewing.

### attach timing

- To attach now, explicitly set `plan_schedule: "immediate"`; omitting it can schedule a lower- or zero-base-price plan for end of cycle.
- A downgrade (incoming base price genuinely lower than the current plan's) should be flagged to the user, asking whether to schedule it for end of cycle. A no-base-price plan (e.g. Enterprise/custom, priced per customer) is not a downgrade.
- Use `starts_at` for single-plan backdates or future starts; do not use `createSchedule` just for this.
- Backdating is only allowed when the customer has no existing Stripe subscription. If the API rejects it, explain that constraint.
- For future billing start with immediate access, set future `starts_at` and `enable_plan_immediately: true`; otherwise the user's plan is created with `scheduled` status in Autumn and access starts on the specified `starts_at`.
- Use `ends_at` only when the user gives an explicit end date or duration.

### updateSubscription timing

- Scheduling is only relevant for canceling at end of cycle.
- Immediate cancel, uncancel, quantity changes, and customizations do not need schedule params.

### createSchedule timing

- If the user describes phases relatively and gives no concrete dates (e.g. "year 1 $10k, year 2 $20k"), use `starts_at: "now"` on phase 1 and `starting_after` on later phases.
- If the user gives concrete phase dates, use explicit `starts_at` values; later `starts_at` values must align exactly with the intended boundary.
- Use a historical first `starts_at` only when the user explicitly asks for a past start.
- Future first-phase `starts_at` is not supported today.
- Resolve every phase's plan and customization before previewing.

### Date handling

- Autumn date params and responses are epoch milliseconds.
- Never interpret epoch milliseconds manually; use `dateToEpochMilliseconds`, `epochMillisecondsToDate`, or the most convenient accurate tool available, such as bash date utilities.
- Prefer ISO dates/timestamps in params when the schema allows them; the tool will convert.
- Present dates as `12 Jun 2026`; include `HH:MM` only when time matters.

## Billing behavior

### Invoice default

- Default operator-led billing actions to invoice mode: `invoice_mode.enabled: true` and `invoice_mode.finalize: false`, and grant access now (see Enable plan immediately for which field).
- Use invoice mode even when the immediate charge is $0, unless the user asks for checkout, self-serve, or direct charging.
- This grants access now while creating a draft Stripe invoice that the operator can review, edit, and send.
- Use explicit net terms from the user or contract in `invoice_mode.net_terms_days`; otherwise do not ask just to set net terms.
- If the customer has no email, ask for it and update the customer before previewing invoice or checkout flows.

### Enable plan immediately

- Top-level `enable_plan_immediately` grants access now whenever payment is deferred or pending (invoice unpaid, checkout incomplete, or future `starts_at`) — a superset of `invoice_mode.enable_plan_immediately`, which only covers the invoice-unpaid case.
- For `createSchedule` and `attach`, set top-level `enable_plan_immediately: true` instead of `invoice_mode.enable_plan_immediately`.
- `updateSubscription` has no top-level field; keep using `invoice_mode.enable_plan_immediately` there.

### Checkout flow

- Use checkout only when the user wants a payment link or checkout session to send to the customer.
- For checkout, omit `invoice_mode`, set `redirect_mode: "always"`, and set `enable_plan_immediately: true`.
- If the user might be asking for checkout but did not say so clearly, clarify before previewing.

### Direct charge flow

- If the user wants self-serve-style billing or immediate card charging, clarify before omitting `invoice_mode`.
- Without `invoice_mode`, eligible plan changes may charge the customer immediately.

### Proration

- Default proration to `none` so the preview starts with no immediate prorated charge or credit.
- If the customer has no existing subscriptions, do not pass `proration_behavior: "none"`; new subscriptions do not allow it.
- Use the endpoint's field name: `proration_behavior` for attach/updateSubscription, `billing_behavior` for createSchedule.
- Use `prorate_immediately` only when the user asks for prorations, immediate true-up, or immediate credits/charges.

## Preview and approval

- Preview only after action, target IDs, quantities, customization, timing, and billing behavior are known or intentionally defaulted.
- If missing information could change immediate charges, access timing, or scheduled state, ask before previewing.
- The main purpose of preview is to determine immediate billing impact: `total`, `currency`, and `line_items`.
- Summarize the preview's impact before the write.
- Lead with immediate impact: amount due now, no immediate charge, or credit.
- Include only preview facts that affect approval; avoid repeating context the user already resolved.
- If `next_cycle` exists, explain the next event: date, amount, and likely reason such as renewal, trial end, cancellation, downgrade, phase change, or nearest multi-interval event.
- Mention material state changes from `incoming` and `outgoing`, but treat them as supporting context if they look stale or incomplete.
- Convert preview timestamps before presenting dates.
- Apply only the exact previewed request. If params change, preview again.

## Completion response

- After the billing action succeeds, respond as concisely as possible: say the action completed successfully.
- Surface any returned customer-facing URL, especially `payment_url` or `invoice.hosted_invoice_url`.
- If an `invoice` is returned, mention its `status`, `stripe_id`, and hosted URL when present.
- If `invoice.hosted_invoice_url` is missing but `invoice.stripe_id` exists, surface the Stripe dashboard invoice URL: sandbox `https://dashboard.stripe.com/test/invoices/{stripe_id}`, live `https://dashboard.stripe.com/invoices/{stripe_id}`.
- If `required_action` is returned, explain the required payment action and include `payment_url` if present.
- If the action fails, state that it failed and quote the server error/status clearly.
- Do not re-summarize the full preview after completion unless the user asks.
