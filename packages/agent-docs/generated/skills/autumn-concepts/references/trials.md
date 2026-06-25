### Trials

- A trial gives a customer temporary access to a plan before billing begins.
- Set a trial with `free_trial` on attach: `{ duration_length, duration_type (day|month|year), card_required, on_end }`.
- `on_end`: `bill` charges when the trial ends (default); `revert` expires the trial and restores the customer's previous plan.

</intro>

<no-existing-plan>

- The customer is on no paid plan. Three flows:
- Card-required trial (preferred, default): attach with `free_trial` and `card_required: true`. If the customer has no payment method, the attach returns a checkout URL (or an invoice URL when `invoice_mode.enabled`) to collect a card; they are charged when the trial ends.
- No-card trial: attach with `card_required: false`. The subscription starts with no card and ends at trial end if none is added. While on it, the customer cannot upgrade or attach another plan until they add a card via the Stripe billing portal.
- Limited-time trial plan: a separate free, no-card plan in the catalog (e.g. `pro_trial`) that grants temporary access, expires automatically, then routes the customer into the normal checkout for the real plan. See `<trial-behavior>` in the Plan concept for modeling. Some orgs configure this — recognize and use it when present.
- Default to `card_required: true` unless the user explicitly asks for no card.

</no-existing-plan>

<existing-paid-plan>

- The customer already has an active (Stripe) subscription — common in sales-led trials.
- Regular flow: attaching a plan with a trial (or updating the subscription to add one) resets the Stripe billing anchor/cycle. This can be undesired so should be carefully treated.
- Revert flow: attach the new plan with `on_end: "revert"` (and `card_required: false`). This grants the plan in Autumn without touching the Stripe subscription; at trial end Autumn moves the customer back to their original plan, preserving the existing billing cycle.
- Set `plan_schedule: "immediate"` on the revert-flow attach so the trial starts now; without it a no-base-price plan over a paid sub is scheduled for end of cycle.

</existing-paid-plan>
