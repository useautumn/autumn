# Where do balances and purchases live?

## The trap: putting shared purchases on the plan

*"Pro is $200/mo per deployment and includes 10k credits. Teams can also buy credit packs — shared across all deployments."*

Tempting (wrong): put the prepaid pack and overage items on the pro plan. It type-checks, it pushes. It breaks the first time a team buys a pack: the credits land on ONE deployment's balance instead of being usable by all of them.

Right — split by who owns what:

```
deployment A gets 10k ┐
deployment B gets 10k ├──►  one shared org balance  ◄── credit-pack add-on (org level)
deployment C gets 10k ┘          ▲
                                 └── any deployment's usage draws from here
```

- The plan's allowance (10k per deployment): pooled — each deployment's grant joins the shared org balance.
- The purchases (packs, overage): an org-level add-on plan. Bought once, usable everywhere.

## Deciding

The rule of thumb: **purchases and balance at the org; caps and usage tracking at the entity.**

- Each entity has its own allowance and its own limit → separate balances per entity (attach the plan per entity, no pooling).
- Grants combine and anyone can spend the total → pooled.
- "Shared across…" anywhere in the pitch → strong pooled signal. Confirm, don't assume separate.
- Want a per-entity cap on a shared balance → that's a usage limit (billing control), not a separate balance.

How pooled balances actually behave (contributions, stacking with customer purchases) is defined in the `autumn-concepts` skill — the plan-items reference for the item flag, the customer-entity reference for the runtime balance. This file only owns the decision.
