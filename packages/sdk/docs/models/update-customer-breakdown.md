# UpdateCustomerBreakdown

## Example Usage

```typescript
import { UpdateCustomerBreakdown } from "@useautumn/sdk";

let value: UpdateCustomerBreakdown = {
  planId: "<id>",
  includedGrant: 2437.9,
  prepaidGrant: 2339.29,
  remaining: 5463.4,
  usage: 6921.41,
  unlimited: false,
  reset: {
    interval: "year",
    resetsAt: 3469.62,
  },
  price: {
    billingUnits: 1078.41,
    billingMethod: "prepaid",
    maxPurchase: 9999.99,
  },
  expiresAt: 9940.8,
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
| `reset`                                                                    | [models.UpdateCustomerReset](../models/update-customer-reset.md)           | :heavy_check_mark:                                                         | Reset configuration for this balance, or null if no reset.                 |
| `price`                                                                    | [models.UpdateCustomerPrice](../models/update-customer-price.md)           | :heavy_check_mark:                                                         | Pricing configuration if this balance has usage-based pricing.             |
| `expiresAt`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | Timestamp when this balance expires, or null for no expiration.            |