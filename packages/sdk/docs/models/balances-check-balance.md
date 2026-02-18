# BalancesCheckBalance

## Example Usage

```typescript
import { BalancesCheckBalance } from "@useautumn/sdk";

let value: BalancesCheckBalance = {
  object: "balance",
  featureId: "<id>",
  granted: 5805.07,
  remaining: 2547.08,
  usage: 3557.86,
  unlimited: false,
  overageAllowed: true,
  maxPurchase: 7196.64,
  nextResetAt: 709.93,
};
```

## Fields

| Field                                                                                 | Type                                                                                  | Required                                                                              | Description                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `object`                                                                              | *"balance"*                                                                           | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `featureId`                                                                           | *string*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `feature`                                                                             | [models.BalancesCheckFeature](../models/balances-check-feature.md)                    | :heavy_minus_sign:                                                                    | N/A                                                                                   |
| `granted`                                                                             | *number*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `remaining`                                                                           | *number*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `usage`                                                                               | *number*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `unlimited`                                                                           | *boolean*                                                                             | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `overageAllowed`                                                                      | *boolean*                                                                             | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `maxPurchase`                                                                         | *number*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `nextResetAt`                                                                         | *number*                                                                              | :heavy_check_mark:                                                                    | N/A                                                                                   |
| `breakdown`                                                                           | [models.BalancesCheckBreakdown](../models/balances-check-breakdown.md)[]              | :heavy_minus_sign:                                                                    | N/A                                                                                   |
| `rollovers`                                                                           | [models.BalancesCheckBalanceRollover](../models/balances-check-balance-rollover.md)[] | :heavy_minus_sign:                                                                    | N/A                                                                                   |