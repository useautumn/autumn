# Breakdown

## Example Usage

```typescript
import { Breakdown } from "@useautumn/sdk";

let value: Breakdown = {
  planId: "<id>",
  includedGrant: 2970.54,
  prepaidGrant: 4188.54,
  remaining: 1280.15,
  usage: 6781.76,
  unlimited: false,
  reset: {
    interval: "week",
    resetsAt: 5720.66,
  },
  price: {
    billingUnits: 9556.8,
    billingMethod: "prepaid",
    maxPurchase: 8750,
  },
  expiresAt: 5815.94,
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
| `reset`                                                                    | [models.CustomerReset](../models/customer-reset.md)                        | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.CustomerPrice](../models/customer-price.md)                        | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |