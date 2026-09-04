# How does a purchase-on-top get modeled?

"Customers can also buy extra credits/packs/top-ups" — two independent questions decide the structure. Answer both; neither alone does.

## Q1 — Whose subscription is it part of?

- Priced or bundled differently per plan ("$20/20k on Team, $60/20k on Starter") → a prepaid **item on each plan**. The price difference IS plan differentiation; a separate add-on can't express it.
- Same offer regardless of plan, opt-in → **one add-on plan** (`addOn: true`, the purchase as its prepaid item). Several sizes are tiers on that one item, not a plan per size.

## Q2 — What level does its balance live at?

The purchase must sit on something attached where the balance is shared.

- Base plans attach at the **customer** → they already ARE customer-level; a shared purchase can be an item on them (Q1 decides which shape).
- Base plans attach **per entity** → no plan at the shared level exists, so a shared purchase forces a **customer-level add-on** — even if Q1 alone wouldn't have created one. An item on the entity plan would strand the balance on one entity.

## The contrast (same sentence, two structures)

*"Teams can also buy shared credit packs."*

```
parent plans at the customer          plans attached per entity
(seats/units via licenses)            (each workspace its own plan)

  Team ── prepaid pack item             workspace plan ── pooled grant
  Starter ── prepaid pack item                │
       (per-plan pricing, Q1)                 ▼
                                      customer add-on ── prepaid pack item
                                       (no customer plan existed, Q2)
```

Left: the parent plan is already customer-level, so the pack is just an item there — and per-plan pricing demanded it anyway. Right: every plan is entity-attached, so the shared pack needs its own customer-level add-on plan.

Say why in the proposal: "packs go on the plan since each plan prices them differently" or "packs are a separate purchase shared by all workspaces".
