# TrackBalancePrice

## Example Usage

```typescript
import { TrackBalancePrice } from "@useautumn/sdk";

let value: TrackBalancePrice = {
  billingUnits: 2578.38,
  billingMethod: "prepaid",
  maxPurchase: null,
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `amount`                                                                      | *number*                                                                      | :heavy_minus_sign:                                                            | The per-unit price amount.                                                    |
| `tiers`                                                                       | [models.TrackBalanceTier](../models/track-balance-tier.md)[]                  | :heavy_minus_sign:                                                            | Tiered pricing configuration if applicable.                                   |
| `billingUnits`                                                                | *number*                                                                      | :heavy_check_mark:                                                            | The number of units per billing increment (eg. $9 / 250 units).               |
| `billingMethod`                                                               | [models.TrackBalanceBillingMethod](../models/track-balance-billing-method.md) | :heavy_check_mark:                                                            | Whether usage is prepaid or billed pay-per-use.                               |
| `maxPurchase`                                                                 | *number*                                                                      | :heavy_check_mark:                                                            | Maximum quantity that can be purchased, or null for unlimited.                |