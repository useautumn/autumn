# BalancesTrackBalancePrice

## Example Usage

```typescript
import { BalancesTrackBalancePrice } from "@useautumn/sdk";

let value: BalancesTrackBalancePrice = {
  billingUnits: 404.47,
  billingMethod: "usage_based",
  maxPurchase: 8873.68,
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `amount`                                                                                       | *number*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `tiers`                                                                                        | [models.BalancesTrackBalanceTier](../models/balances-track-balance-tier.md)[]                  | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `billingUnits`                                                                                 | *number*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `billingMethod`                                                                                | [models.BalancesTrackBalanceBillingMethod](../models/balances-track-balance-billing-method.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `maxPurchase`                                                                                  | *number*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |