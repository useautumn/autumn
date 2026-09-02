# Volume buckets: variants or one prepaid item?

## The trap: "tiers" in the user's mouth becomes `tiers` in the config

*"Starter also comes in higher transcription tiers — the 60K tier at $39/month with 60,000 minutes included, the 150K tier at $69/month with 150,000. Same $1.20 per 1,000 overage on all of them."*

Tempting (wrong): fold the tiers into Starter as one prepaid volume-tiered item. It type-checks, it pushes. Two smells say it's wrong before it breaks:

- Starter's $19 base price has nowhere to go — you end up deleting it and decomposing each tier price into fake quantity rows. **Restructuring the existing plan to make the new "tiers" fit is the wrong-fork smell.**
- $19/20K, $39/60K, $69/150K follow no per-unit rate — these are price points on a menu, not a price rule.

Right — each tier IS the subscription, so each is a variant of the base plan:

```ts
export const starter60k = starter.variant({
  id: "starter_60k",
  name: "Starter 60K",
  customize: {
    price: { amount: 39, interval: "month" },
    addItems: [item({ featureId: minutes.id, included: 60_000, reset: { interval: "month" }, price: minuteOverage })],
    removeItems: [{ featureId: minutes.id }],
  },
});
```

The base plan stays untouched; customers upgrade between tiers like between plans.

## When one prepaid item IS right

*"Buy extra render hours any time: 200 for $30, 1,000 for $120, 5,000 for $500."*

The bucket is a quantity bought **on top of** whatever plan they're on — nothing about their subscription changes. One prepaid item with volume tiers, because the tier rows only map quantity to price. Where that item sits (plan vs add-on) is the add-on fork's question, not this one's.

## Deciding

Ask one question: **is each bucket the subscription itself, or a purchase on top of one?**

- The subscription itself → one variant per bucket.
- A purchase on top → prepaid item; volume tiers when the per-unit rate shifts with quantity.
- Per-bucket overage rates or per-bucket features → variants regardless; one item cannot express those.
- Unsure → variants (they can express anything a tier row can, not vice versa), or ask: "do customers subscribe to a tier, or buy an amount on top of their plan?"

What variants can and cannot change is defined in the plan-variants docs; this file only owns the decision.
