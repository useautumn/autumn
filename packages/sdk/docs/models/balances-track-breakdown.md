# BalancesTrackBreakdown

## Example Usage

```typescript
import { BalancesTrackBreakdown } from "@useautumn/sdk";

let value: BalancesTrackBreakdown = {
  planId: null,
  includedGrant: 9958.89,
  prepaidGrant: 8123.08,
  remaining: 5363.08,
  usage: 4513.3,
  unlimited: false,
  reset: {
    interval: "<value>",
    resetsAt: 6044.5,
  },
  price: {
    billingUnits: 5510.57,
    billingMethod: "usage_based",
    maxPurchase: 2833.31,
  },
  expiresAt: null,
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `id`                                                           | *string*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `planId`                                                       | *string*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `includedGrant`                                                | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `prepaidGrant`                                                 | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `remaining`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `usage`                                                        | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `unlimited`                                                    | *boolean*                                                      | :heavy_check_mark:                                             | N/A                                                            |
| `reset`                                                        | [models.BalancesTrackReset](../models/balances-track-reset.md) | :heavy_check_mark:                                             | N/A                                                            |
| `price`                                                        | [models.BalancesTrackPrice](../models/balances-track-price.md) | :heavy_check_mark:                                             | N/A                                                            |
| `expiresAt`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |