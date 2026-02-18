# BalancesCheckBreakdown

## Example Usage

```typescript
import { BalancesCheckBreakdown } from "@useautumn/sdk";

let value: BalancesCheckBreakdown = {
  object: "balance_breakdown",
  planId: "<id>",
  includedGrant: 639.18,
  prepaidGrant: 9880.63,
  remaining: 449.68,
  usage: 8613.17,
  unlimited: true,
  reset: {
    interval: "<value>",
    resetsAt: 7109.07,
  },
  price: {
    billingUnits: 2274.85,
    billingMethod: "prepaid",
    maxPurchase: 4165.66,
  },
  expiresAt: 2424.28,
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `object`                                                       | *"balance_breakdown"*                                          | :heavy_check_mark:                                             | N/A                                                            |
| `id`                                                           | *string*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `planId`                                                       | *string*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `includedGrant`                                                | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `prepaidGrant`                                                 | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `remaining`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `usage`                                                        | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `unlimited`                                                    | *boolean*                                                      | :heavy_check_mark:                                             | N/A                                                            |
| `reset`                                                        | [models.BalancesCheckReset](../models/balances-check-reset.md) | :heavy_check_mark:                                             | N/A                                                            |
| `price`                                                        | [models.BalancesCheckPrice](../models/balances-check-price.md) | :heavy_check_mark:                                             | N/A                                                            |
| `expiresAt`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |