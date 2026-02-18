# BalancesTrackBalance

## Example Usage

```typescript
import { BalancesTrackBalance } from "@useautumn/sdk";

let value: BalancesTrackBalance = {
  object: "balance",
  featureId: "<id>",
  granted: 6031.57,
  remaining: 4645.12,
  usage: 8809.38,
  unlimited: true,
  overageAllowed: false,
  maxPurchase: null,
  nextResetAt: 3946.98,
};
```

## Fields

| Field                                                                                   | Type                                                                                    | Required                                                                                | Description                                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `object`                                                                                | *"balance"*                                                                             | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `featureId`                                                                             | *string*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `feature`                                                                               | [models.BalancesTrackBalanceFeature](../models/balances-track-balance-feature.md)       | :heavy_minus_sign:                                                                      | N/A                                                                                     |
| `granted`                                                                               | *number*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `remaining`                                                                             | *number*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `usage`                                                                                 | *number*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `unlimited`                                                                             | *boolean*                                                                               | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `overageAllowed`                                                                        | *boolean*                                                                               | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `maxPurchase`                                                                           | *number*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `nextResetAt`                                                                           | *number*                                                                                | :heavy_check_mark:                                                                      | N/A                                                                                     |
| `breakdown`                                                                             | [models.BalancesTrackBalanceBreakdown](../models/balances-track-balance-breakdown.md)[] | :heavy_minus_sign:                                                                      | N/A                                                                                     |
| `rollovers`                                                                             | [models.BalancesTrackBalanceRollover](../models/balances-track-balance-rollover.md)[]   | :heavy_minus_sign:                                                                      | N/A                                                                                     |