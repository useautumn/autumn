# BalancesTrackBalanceBreakdown

## Example Usage

```typescript
import { BalancesTrackBalanceBreakdown } from "@useautumn/sdk";

let value: BalancesTrackBalanceBreakdown = {
  planId: "<id>",
  includedGrant: 1267.23,
  prepaidGrant: 7892.69,
  remaining: 8736.65,
  usage: 6694.14,
  unlimited: false,
  reset: {
    interval: "one_off",
    resetsAt: 1535.27,
  },
  price: {
    billingUnits: 6850.46,
    billingMethod: "usage_based",
    maxPurchase: 6457.4,
  },
  expiresAt: null,
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                                                                          | *string*                                                                      | :heavy_minus_sign:                                                            | N/A                                                                           |
| `planId`                                                                      | *string*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `includedGrant`                                                               | *number*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `prepaidGrant`                                                                | *number*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `remaining`                                                                   | *number*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `usage`                                                                       | *number*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `unlimited`                                                                   | *boolean*                                                                     | :heavy_check_mark:                                                            | N/A                                                                           |
| `reset`                                                                       | [models.BalancesTrackBalanceReset](../models/balances-track-balance-reset.md) | :heavy_check_mark:                                                            | N/A                                                                           |
| `price`                                                                       | [models.BalancesTrackBalancePrice](../models/balances-track-balance-price.md) | :heavy_check_mark:                                                            | N/A                                                                           |
| `expiresAt`                                                                   | *number*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |