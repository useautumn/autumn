# Seats: per-unit item or licenses?

The normal case is simple; the trap is missing the uncommon one.

## Normal: seats are just a number

*"$10 per seat."* Nothing granted per seat, nobody assigns seats to people.

→ A per-unit priced item on the plan. No entities, no licenses. Done.

## The trap: each seat grants something

*"Team is $40/seat/month, every seat gets 100 summaries."*

Tempting (wrong): per-unit seat item + one big summaries allowance on the team plan.

Why it breaks: the allowance doesn't grow when they add a 6th seat, and seats have no identity — no per-seat balance, no assigning seat #3 to Alice.

Right: the seat is a **license** — a small plan of its own (own group, $40 price, grants 100 summaries) that the team plan hands out per seat:

```ts
export const seat = plan({
  id: "seat",
  group: "seat",
  price: { amount: 40, interval: "month" },
  items: [item({ featureId: summaries.id, included: 100, reset: { interval: "month" } })],
});

export const team = plan({
  id: "team",
  licenses: [{ licensePlanId: seat.id }],
});
```

## Rare: seats need identity but grant nothing

They want to assign, reassign, and hold empty seats — each seat tracked on its own plan. Also licenses. Uncommon; confirm they actually need it before reaching for this.

## Deciding

Ask one question: **does a seat grant anything?**

- No → per-unit item (normal case).
- Yes → licenses.
- No, but they need to track who holds each seat → licenses (rare — confirm).

What licenses *are* (pools, assign/release, per-link customize) is defined in the `autumn-concepts` skill's licenses reference; attach flows live in the entity-plans docs. Read those when building — this file only owns the decision.
