# Seats: per-unit item or licenses?

The normal case is simple; the trap is missing the uncommon one.

## Normal: seats are just a number

*"$10 per seat."* Nothing granted per seat, nobody assigns seats to people.

→ A per-unit priced item on the plan. No entities, no licenses. Done.

## The trap: each seat grants something

*"Team is $40/seat/month, every seat gets 100 summaries."*

Tempting (wrong): per-unit seat item + one big summaries allowance on the team plan.

Why it breaks: the allowance doesn't grow when they add a 6th seat, and seats have no identity — no per-seat balance, no assigning seat #3 to Alice.

Right: the seat is a **license** — a small plan of its own (own group, $40 price, grants 100 summaries) that the team plan hands out per seat. `included` on the license link is how many come free with the parent; extras bill at the seat plan's price:

```ts
export const seat = plan({
  id: "seat",
  group: "seat",
  price: { amount: 40, interval: "month" },
  items: [item({ featureId: summaries.id, included: 100, reset: { interval: "month" } })],
});

export const team = plan({
  id: "team",
  price: { amount: 500, interval: "month" },
  licenses: [{ licensePlanId: seat.id, included: 5 }],
});
```

Division of labor when both levels exist: **per-seat things (the seat's own price, its granted allowance) live on the license plan; account-wide things (base price, shared purchases like credit packs) live on the parent** — the parent attaches at the customer, so its items are already shared by every seat. Don't invent add-on plans for purchases the parent can carry, and don't put the per-seat grant on the parent (it wouldn't scale with seats).

## When parents differ: one child, per-license diffs

**Define the child plan ONCE; every parent references the same child id, carrying its own differences in `customize`.** N parents → 1 child plan definition → N license entries. The child holds the mainline take (what the primary parent gets) plus everything all units share (boolean features); a differing parent's license overrides only its own price/grant.

The shape, schematically:

```ts
export const <child> = plan({
  id: "<child>",
  group: "<child>",                       // own group, or attaching replaces the parent
  price: { amount: <mainline unit price>, interval: "month" },
  items: [ <mainline grant>, <booleans every unit has> ],
});

export const <parentA> = plan({           // gets the mainline take: link only
  licenses: [{ licensePlanId: <child>.id, included: <n> }],
});

export const <parentB> = plan({           // differs: diff on the license, never a second child plan
  licenses: [{
    licensePlanId: <child>.id,
    included: <m>,
    customize: {
      price: { amount: <parentB unit price>, interval: "month" },
      addItems: [ <parentB's grant> ],
      removeItems: [ <filter matching the mainline grant> ],
    },
  }],
});
```

Worked example — an agency platform: Studio ($90/mo) and Agency ($450/mo) both sell client sites. A site is $8/mo on Agency with 2,000 renders; on Studio it's $12/mo with only 750. Every site gets SSL:

```ts
export const site = plan({
  id: "site",
  group: "site",
  price: { amount: 8, interval: "month" },
  items: [
    item({ featureId: renders.id, included: 2000, reset: { interval: "month" } }),
    item({ featureId: ssl.id }),
  ],
});

export const agency = plan({
  id: "agency",
  price: { amount: 450, interval: "month" },
  licenses: [{ licensePlanId: site.id, included: 10 }],
});

export const studio = plan({
  id: "studio",
  price: { amount: 90, interval: "month" },
  licenses: [{
    licensePlanId: site.id,
    included: 2,
    customize: {
      price: { amount: 12, interval: "month" },
      addItems: [item({ featureId: renders.id, included: 750, reset: { interval: "month" } })],
      removeItems: [{ featureId: renders.id }],
    },
  }],
});
```

WRONG — child duplicated per parent:

```ts
export const studioSite = plan({ id: "studio_site", price: { amount: 12, ... }, items: [ /* 750 renders, SSL */ ] });
export const agencySite = plan({ id: "agency_site", price: { amount: 8, ... },  items: [ /* 2000 renders, SSL */ ] });
```

RIGHT — the `site` config above: one `site` plan, two license entries, studio's diff in `customize`. Duplicated children break sharing — an SSL change now needs two edits, and a customer moving Studio→Agency gets a brand-new site plan instead of the same one on new terms.

**Self-check before finishing: count the child plan definitions for this pattern — there must be exactly one.**

## Rare: seats need identity but grant nothing

They want to assign, reassign, and hold empty seats — each seat tracked on its own plan. Also licenses. Uncommon; confirm they actually need it before reaching for this.

## Deciding

Ask one question: **does a seat grant anything?**

- No → per-unit item (normal case).
- Yes → licenses.
- No, but they need to track who holds each seat → licenses (rare — confirm).

What licenses *are* (pools, assign/release, per-link customize) is defined in the `autumn-concepts` skill's licenses reference; attach flows live in the entity-plans docs. Read those when building — this file only owns the decision.
