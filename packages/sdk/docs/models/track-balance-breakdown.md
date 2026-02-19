# TrackBalanceBreakdown

## Example Usage

```typescript
import { TrackBalanceBreakdown } from "@useautumn/sdk";

let value: TrackBalanceBreakdown = {
  planId: "<id>",
  includedGrant: 5298.68,
  prepaidGrant: 6183.17,
  remaining: 4520.51,
  usage: 376.7,
  unlimited: true,
  reset: {
    interval: "one_off",
    resetsAt: 2544.52,
  },
  price: null,
  expiresAt: null,
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
| `reset`                                                                    | [models.TrackBalanceReset](../models/track-balance-reset.md)               | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.TrackBalancePrice](../models/track-balance-price.md)               | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |