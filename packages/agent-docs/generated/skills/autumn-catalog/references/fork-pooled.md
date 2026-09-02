# Where do balances and purchases live?

## The trap: putting shared purchases on the plan

*"Growth is $99/mo per project and includes 20k tokens. Teams can also buy token packs — shared across all their projects."*

Tempting (wrong): put the prepaid pack items on the growth plan. It type-checks, it pushes. It breaks the first time a team buys a pack: the tokens land on ONE project's balance instead of being usable by all of them.

Right — split by who owns what:

```
project A gets 20k + overage ┐
project B gets 20k + overage ├──►  one shared customer balance  ◄── token-pack add-on (customer level)
project C gets 20k + overage ┘          ▲
                                        └── any project's usage draws from here
```

- The plan's allowance (20k per project): pooled — each project's grant joins the shared customer balance (`pooled: true` on the item).
- Purchases the whole team shares (packs): here a customer-level add-on plan, because every plan is entity-attached — no customer-level plan exists to carry the item. The full plan-item-vs-add-on decision is the add-on fork's.
- Overage ($/token past the allowance): usually an item on each project's plan even when the balance is pooled, because that breaks extra usage down per entity. Two items on the plan: the pooled grant carries no price, and a separate usage-priced item (`included: 0`) carries the overage — a pooled item can't itself be usage-priced.

## Deciding

The rule of thumb: **purchases and balance at the org; caps and usage tracking at the entity.**

- Each entity has its own allowance and its own limit → separate balances per entity (attach the plan per entity, no pooling).
- Grants combine and anyone can spend the total → pooled.
- "Shared across…" anywhere in the pitch → strong pooled signal. Confirm, don't assume separate.
- Want a per-entity cap on a shared balance → that's a usage limit (billing control), not a separate balance.

How pooled balances actually behave (contributions, stacking with customer purchases) is defined in the `autumn-concepts` skill — the plan-items reference for the item flag, the customer-entity reference for the runtime balance. This file only owns the decision.
