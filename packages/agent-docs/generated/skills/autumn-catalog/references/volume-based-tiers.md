## Volume-Based Tiers

Volume-based pricing uses tiers to determine a single flat charge based on the total usage volume. Unlike [graduated pricing](/documentation/modelling-pricing/graduated-pricing), where each tier has its own rate, volume-based pricing charges a single flat amount based on which tier the total usage falls into.

> **Example** <br />
> A data platform charges:
> - 0–1,000 records: $100 flat
> - 1,001–10,000 records: $500 flat
> - 10,001+: $1,000 flat
>
> A customer who processes 15,000 records falls into the 10,001+ tier and pays a flat **$1,000**
>
> Compare this to graduated pricing, where each tier is charged separately and summed together

## Setting up

Use the `tiers` array with `tierBehavior: 'volume'` on a plan item price:

```ts autumn.config.ts
import { atmn, feature, plan } from "atmn";

export const records = feature({
  featureId: "records",
  name: "Records Processed",
  type: "metered",
  consumable: true,
});

export const pro = plan({
  planId: "pro",
  versionSlug: "v1",
  active: true,
  name: "Pro",
  price: { amount: 50, interval: "month" },
  items: [
    {
      featureId: records.featureId,
      reset: { interval: "month" },
      price: {
        tiers: [
          { to: 1000, flatAmount: 100 },
          { to: 10000, flatAmount: 500 },
          { to: "inf", flatAmount: 1000 },
        ],
        tierBehavior: "volume",
        billingMethod: "prepaid",
        interval: "month",
      },
    },
  ],
});

export default atmn({ features: [records], plans: [pro] });
```

Preview with `atmn push`, then apply with `atmn push --yes`.

## How volume-based pricing works

Autumn:

1. Looks at the total volume for the feature
2. Finds the tier the total falls into
3. Charges the flat amount for that tier

Volume tiers are prepaid-only.

| Total volume | Matching tier | Charge |
|-------------|---------------|--------|
| 500 | 0–1,000 | **$100** |
| 5,000 | 1,001–10,000 | **$500** |
| 15,000 | 10,001+ | **$1,000** |

## Tier configuration

Each tier has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `to` | number or `"inf"` | The upper boundary of this tier |
| `flatAmount` | number | Flat fee charged when the total volume falls in this tier (`flat_amount` over the API) |
| `amount` | number | Optional per-unit price applied to the total volume when this tier is the matching tier |

Tiers must be in ascending order by `to`. The final tier should use `"inf"`.

## Combining flat and per-unit amounts

Each tier can include both `flatAmount` and `amount` — a fixed fee plus a per-unit charge when that tier is the matching tier. This is useful for combining a base fee with per-unit volume pricing.

```ts
price: {
  tiers: [
    { to: 1000, amount: 0.10, flatAmount: 0 },
    { to: 10000, amount: 0.08, flatAmount: 50 },
    { to: "inf", amount: 0.05, flatAmount: 100 },
  ],
  tierBehavior: "volume",
  billingMethod: "prepaid",
  interval: "month",
}
```

A customer with 5,000 records would pay: (5,000 × $0.08) + $50 = **$450**

## Graduated vs volume-based

| | Graduated | Volume-based |
|---|-----------|--------------|
| **Rate applied** | Each tier at its own rate | Single flat amount for the matching tier |
| **Total charge** | Sum of each tier's charge | Flat amount of the matching tier |
| **Best for** | Rewarding growth with lower marginal rates | Simpler pricing with volume discounts |

See [Graduated Pricing](/documentation/modelling-pricing/graduated-pricing) for the alternative model.
