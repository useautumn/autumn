# Balance

## Example Usage

```typescript
import { Balance } from "@useautumn/sdk";

let value: Balance = {
  featureId: "messages",
  granted: 100,
  remaining: 72,
  usage: 28,
  unlimited: false,
  overageAllowed: false,
  maxPurchase: null,
  nextResetAt: 1773851121437,
  breakdown: [
    {
      id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
      planId: "pro_plan",
      includedGrant: 100,
      prepaidGrant: 0,
      remaining: 72,
      usage: 28,
      unlimited: false,
      reset: {
        interval: "month",
        resetsAt: 1773851121437,
      },
      price: null,
      expiresAt: null,
    },
  ],
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `featureId`                                                                   | *string*                                                                      | :heavy_check_mark:                                                            | The feature ID this balance is for.                                           |
| `feature`                                                                     | [models.BalanceFeature](../models/balance-feature.md)                         | :heavy_minus_sign:                                                            | The full feature object if expanded.                                          |
| `granted`                                                                     | *number*                                                                      | :heavy_check_mark:                                                            | Total balance granted (included + prepaid).                                   |
| `remaining`                                                                   | *number*                                                                      | :heavy_check_mark:                                                            | Remaining balance available for use.                                          |
| `usage`                                                                       | *number*                                                                      | :heavy_check_mark:                                                            | Total usage consumed in the current period.                                   |
| `unlimited`                                                                   | *boolean*                                                                     | :heavy_check_mark:                                                            | Whether this feature has unlimited usage.                                     |
| `overageAllowed`                                                              | *boolean*                                                                     | :heavy_check_mark:                                                            | Whether usage beyond the granted balance is allowed (with overage charges).   |
| `maxPurchase`                                                                 | *number*                                                                      | :heavy_check_mark:                                                            | Maximum quantity that can be purchased as a top-up, or null for unlimited.    |
| `nextResetAt`                                                                 | *number*                                                                      | :heavy_check_mark:                                                            | Timestamp when the balance will reset, or null for no reset.                  |
| `breakdown`                                                                   | [models.Breakdown](../models/breakdown.md)[]                                  | :heavy_minus_sign:                                                            | Detailed breakdown of balance sources when stacking multiple plans or grants. |
| `rollovers`                                                                   | [models.BalanceRollover](../models/balance-rollover.md)[]                     | :heavy_minus_sign:                                                            | Rollover balances carried over from previous periods.                         |