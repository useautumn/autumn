# BalancesTrackBalances

## Example Usage

```typescript
import { BalancesTrackBalances } from "@useautumn/sdk";

let value: BalancesTrackBalances = {
  featureId: "<id>",
  granted: 4279.52,
  remaining: 1892.83,
  usage: 6157.43,
  unlimited: true,
  overageAllowed: false,
  maxPurchase: 9971.7,
  nextResetAt: 2572.61,
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `featureId`                                                              | *string*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `feature`                                                                | [models.BalancesTrackFeature](../models/balances-track-feature.md)       | :heavy_minus_sign:                                                       | N/A                                                                      |
| `granted`                                                                | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `remaining`                                                              | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `usage`                                                                  | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `unlimited`                                                              | *boolean*                                                                | :heavy_check_mark:                                                       | N/A                                                                      |
| `overageAllowed`                                                         | *boolean*                                                                | :heavy_check_mark:                                                       | N/A                                                                      |
| `maxPurchase`                                                            | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `nextResetAt`                                                            | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `breakdown`                                                              | [models.BalancesTrackBreakdown](../models/balances-track-breakdown.md)[] | :heavy_minus_sign:                                                       | N/A                                                                      |
| `rollovers`                                                              | [models.BalancesTrackRollover](../models/balances-track-rollover.md)[]   | :heavy_minus_sign:                                                       | N/A                                                                      |