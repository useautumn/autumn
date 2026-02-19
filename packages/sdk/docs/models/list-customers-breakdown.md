# ListCustomersBreakdown

## Example Usage

```typescript
import { ListCustomersBreakdown } from "@useautumn/sdk";

let value: ListCustomersBreakdown = {
  planId: "<id>",
  includedGrant: 625.15,
  prepaidGrant: 422.07,
  remaining: 9195.45,
  usage: 8064.71,
  unlimited: true,
  reset: {
    interval: "week",
    resetsAt: 4427.32,
  },
  price: {
    billingUnits: 7234.97,
    billingMethod: "prepaid",
    maxPurchase: 6333.52,
  },
  expiresAt: 9959.62,
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
| `reset`                                                                    | [models.ListCustomersReset](../models/list-customers-reset.md)             | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.ListCustomersPrice](../models/list-customers-price.md)             | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |