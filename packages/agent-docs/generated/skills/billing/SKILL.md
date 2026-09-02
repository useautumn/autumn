---
name: billing
description: Steps for updating a customer's billing state — attaching a plan, updating a subscription, or scheduling a change. Use whenever the user asks to change what a customer is billed for.
---

# Billing

Follow these steps carefully for every request that updates a customer's billing state.

This covers the majority of cases. Load skills upfront when needed:
- Load the `trials` skill first if the request involves a trial, or the customer is already trialing.
- Load the `schedules` skill first if the request moves the customer between plans over time, or the customer already has a schedule.
- Load the `balances` skill first if the request mentions a cap, limit, overage, or credit allowance, or the customer already has billing controls set.

## 1. Read the customer's current state

- Call `getAgentRules`, `getCustomer`, `listEntities`, and `verify` in ONE batch — never one after another. The org's agent rules can override any default below.
- `verify` diffs what Autumn expects against live Stripe. If it returns mismatches, flag them to the user.
- Then decide which operation the request needs based on the current state and the target plan ID:
  - Is the target plan ID already active on that customer or entity? → updateSubscription
  - Moving the customer onto a different plan ID? → `attach` or `multiAttach`
  - Moving them onto a plan(s) in several phases (ramps, staged pricing) → `createSchedule`

Then decide how it is paid. Follow the user's instructions or the org rules. If neither says:

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

## 2. Build the request body

- Any customer-specific pricing goes in `customize` — a patch over the catalog plan, not a replacement. Use `add_items` and `remove_items`. Do not replace the whole `items` array.
```json
{ "customize": {
    "remove_items": [{ "feature_id": "credits" }],
    "add_items": [{ "feature_id": "credits", "included": 5000 }] } }
```
- `add_items` is a full item definition, so read that item's fields (`pooled`, `reset`, `rollover`, …) off the plan first and restate every one unless specified explicitly.
- Base price changes go in `customize.price`.
- Each remove entry is a filter. When `feature_id` alone could match more than one item, add `billing_method`, `interval`, or `interval_count` to pin the right one.

## 3. Preview, then write

- Call the matching preview: `previewAttach`, `previewCreateSchedule`, or `previewUpdateSubscription`.
- If it comes back clean, call the write in the same turn. Emit no prose in between — the write call is what shows the approval card.
- If the preview fails, state the blocking reason once and stop.
- When a request needs more than one write — change the email then attach, create a reward then attach — issue them together in a single batch so the user approves once.
- Run every preview you need first, then send all the writes together.

## 4. Write the approval description

- Bullet what is happening, one line per step, in the order the steps apply.
- Say what changes for the customer, what they pay, and when it takes effect.
- For a batched request, repeat the same complete description on every write.

## 5. Report the result once it is approved

The write runs outside your turn. You are handed its result in an `<approval_applied>` block.

- Say it applied, then list the links as markdown bullets. Every link is a hyperlink with a short label — `[View invoice](url)`, `[Stripe customer](url)` — never a bare url pasted into the text.
- if `invoice.status` is `draft` → say it must be finalized there before the customer is charged.
- If it failed, say so and quote the error. No links for a change that did not apply.
- If the customer made a mistake and asks for something that needs to be undone, direct them to the dashboard.
- Then continue to carry out any remaining steps the user requested if not done already.
