# CreateEntityBreakdown

## Example Usage

```typescript
import { CreateEntityBreakdown } from "@useautumn/sdk";

let value: CreateEntityBreakdown = {
  planId: "<id>",
  includedGrant: 4526.54,
  prepaidGrant: 4519.44,
  remaining: 6479.7,
  usage: 9789.79,
  unlimited: false,
  reset: {
    interval: "<value>",
    resetsAt: 2923.33,
  },
  price: {
    billingUnits: 4543.63,
    billingMethod: "usage_based",
    maxPurchase: 2063.43,
  },
  expiresAt: 9755.62,
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
| `reset`                                                                    | [models.CreateEntityReset](../models/create-entity-reset.md)               | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.CreateEntityPrice](../models/create-entity-price.md)               | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |