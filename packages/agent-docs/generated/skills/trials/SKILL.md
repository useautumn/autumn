---
name: trials
description: Setting up or reasoning about a free trial — how long it runs, whether a card is required, what happens when it ends, and how trialing a customer who already pays differs from trialing a new one. Load when the request mentions a trial, or the customer is already on one.
---

# Trials

### Trials

- A trial gives a customer temporary, free access to a plan. It can be passed in during the billing call, or it can come with the plan configuration itself (which can be overriden).
- Set a trial with `free_trial` on attach: `{ duration_length, duration_type (day|month|year), card_required, on_end }`. Always pass `duration_type`. 
- Default to card not required (if there is no paid plan), and on_end: revert (if there is a paid plan).

If the customer the customer is NOT on a paid plan (free plan or no plan at all). 2 options:

- No-card trial (default to this): attach with `free_trial` and set `card_required` false. The subscription starts with no card and ends at trial end if none is added. While on it, the customer cannot upgrade or attach another plan until they add a card via the Stripe billing portal.
- Card-required trial: attach with `free_trial` and `card_required: true` and `long_lived_checkout` If the customer has no payment method, the attach returns a checkout URL to collect a card; they are charged when the trial ends. This should be done with a long-lived checkout URL param.

The customer already has an active (Stripe) subscription — common in sales-led trials.

- On end: revert (default to this): attach the new plan with `on_end: "revert"` . This grants the plan in Autumn without touching the Stripe subscription; at trial end Autumn moves the customer back to their original plan, preserving the existing billing cycle.
- On end: bill -- attaching a plan with a trial (or updating the subscription to add one) resets the Stripe billing anchor/cycle. This can be undesired: warn the user, offer `on_end: "revert"` instead, and let them choose.
- Card required param is ignored if there is already an active sub.

Updating or ending a trial
- Call update_subscription on the trialing plan with a new `free_trial`. The duration is counted from now, not from the original start. A 14-day extension on day 10 of a 14-day trial gives 14 more days, not 4.
- Pass `free_trial: null` to end the trial immediately instead.
