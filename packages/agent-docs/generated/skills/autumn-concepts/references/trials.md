### Trials

- A trial gives a customer temporary access to a plan before billing begins.
- Set a trial with `free_trial` on attach: `{ duration_length, duration_type (day|month|year), card_required, on_end }`. Always pass `duration_type` — omitting it means MONTHS, so a bare `duration_length: 14` is 14 months, not 14 days.
- There is no `week` unit: express weeks as days — "2 weeks" is `{ duration_length: 14, duration_type: "day" }`, "6 weeks" is 42 days. Never round a week to a month.
- `on_end` decides what happens when the trial ends, and defaults to `bill` when absent:
  - `bill` (default) — the customer is charged for the plan they trialled and stays on it. Right for a new customer trying a plan they intend to buy.
  - `revert` — the trial expires and the customer returns to the plan they were on before. Right when you are pausing an existing plan to let them try a different one: pass `revert` so they land back where they started instead of being charged for the new plan.

</intro>

<no-existing-plan>

- The customer is on no paid plan. Three flows:
- Card-required trial: attach with `free_trial` and `card_required: true`. If the customer has no payment method, the attach returns a checkout URL (or an invoice URL when `invoice_mode.enabled`) to collect a card; they are charged when the trial ends.
- No-card trial (the default): attach with `free_trial` and leave `card_required` unset. The subscription starts with no card and ends at trial end if none is added. While on it, the customer cannot upgrade or attach another plan until they add a card via the Stripe billing portal.
- Limited-time trial plan: a separate free, no-card plan in the catalog (e.g. `pro_trial`) that grants temporary access, expires automatically, then routes the customer into the normal checkout for the real plan. See `<trial-behavior>` in the Plan concept for modeling. Some orgs configure this — recognize and use it when present.
- `card_required` defaults to false on the tools you use: a trial collects no card unless the user asks for one. Set `card_required: true` only when they say the customer must add a card up front.

</no-existing-plan>

<existing-paid-plan>

- The customer already has an active (Stripe) subscription — common in sales-led trials.
- Regular flow: attaching a plan with a trial (or updating the subscription to add one) resets the Stripe billing anchor/cycle. This can be undesired so should be carefully treated.
- Revert flow: attach the new plan with `on_end: "revert"` (and `card_required: false`). This grants the plan in Autumn without touching the Stripe subscription; at trial end Autumn moves the customer back to their original plan, preserving the existing billing cycle.
- Set `plan_schedule: "immediate"` on the revert-flow attach so the trial starts now; without it a no-base-price plan over a paid sub is scheduled for end of cycle.

</existing-paid-plan>
