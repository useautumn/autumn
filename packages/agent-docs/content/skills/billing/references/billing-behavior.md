## Billing behavior

### Invoice default

- Default operator-led billing actions to invoice mode: `invoice_mode.enabled: true` and `invoice_mode.finalize: false`, and grant access now (see Enable plan immediately for which field).
- Use invoice mode even when the immediate charge is $0, unless the user asks for checkout, self-serve, or direct charging.
- This grants access now while creating a draft Stripe invoice that the operator can review, edit, and send.
- Use explicit net terms from the user or contract in `invoice_mode.net_terms_days`; otherwise do not ask just to set net terms.
- If the customer has no email, ask for it and update the customer before previewing invoice or checkout flows.
- To limit how the customer can pay, set `invoice_mode.payment_method_types` (e.g. `["card", "us_bank_account"]`). It overrides the org's default payment methods for that invoice and its renewals; omit it to keep the defaults. `createInvoice` takes the same field top-level.

### Switching collection method

- To move an existing subscription between invoicing and charging automatically, call `updateSubscription` with `invoice_mode` as the only change: `{ enabled: true, net_terms_days?, payment_method_types? }` for invoicing, `{ enabled: false }` for charging automatically.
- The switch applies from the next renewal: nothing is charged or invoiced now, and open invoices keep their method. Preview it like any update; the total is $0.
- Switching to charging automatically needs a card on file; without one it is rejected, so collect a card first.
- Adding any other change (plan, quantities, items) makes `invoice_mode` describe how that change is billed instead of switching the subscription.

### Invoice payment methods

- To change how a customer can pay an existing draft or open invoice, use `updateInvoice` with `invoice_id` (Autumn `inv_...`) and `payment_method_types`. Paid and void invoices cannot be changed.

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
