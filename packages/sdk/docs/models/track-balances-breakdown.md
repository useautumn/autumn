# TrackBalancesBreakdown

## Example Usage

```typescript
import { TrackBalancesBreakdown } from "@useautumn/sdk";

let value: TrackBalancesBreakdown = {
  planId: "<id>",
  includedGrant: 6975.73,
  prepaidGrant: 8920.32,
  remaining: 1995.26,
  usage: 6914.28,
  unlimited: true,
  reset: {
    interval: "<value>",
    resetsAt: 4863.52,
  },
  price: {
    billingUnits: 7026.6,
    billingMethod: "usage_based",
    maxPurchase: 196.39,
  },
  expiresAt: 3405.11,
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`                                                                       | *string*                                                                   | :heavy_minus_sign:                                                         | The unique identifier for this balance breakdown.                          |
| `planId`                                                                   | *string*                                                                   | :heavy_check_mark:                                                         | The plan ID this balance originates from, or null for standalone balances. |
| `includedGrant`                                                            | *number*                                                                   | :heavy_check_mark:                                                         | Amount granted from the plan's included usage.                             |
| `prepaidGrant`                                                             | *number*                                                                   | :heavy_check_mark:                                                         | Amount granted from prepaid purchases or top-ups.                          |
| `remaining`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Remaining balance available for use.                                       |
| `usage`                                                                    | *number*                                                                   | :heavy_check_mark:                                                         | Amount consumed in the current period.                                     |
| `unlimited`                                                                | *boolean*                                                                  | :heavy_check_mark:                                                         | Whether this balance has unlimited usage.                                  |
| `reset`                                                                    | [models.TrackBalancesReset](../models/track-balances-reset.md)             | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.TrackBalancesPrice](../models/track-balances-price.md)             | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |