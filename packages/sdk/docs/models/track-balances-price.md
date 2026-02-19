# TrackBalancesPrice

## Example Usage

```typescript
import { TrackBalancesPrice } from "@useautumn/sdk";

let value: TrackBalancesPrice = {
  billingUnits: 6878.57,
  billingMethod: "prepaid",
  maxPurchase: 3245.19,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_minus_sign:                                                              | The per-unit price amount.                                                      |
| `tiers`                                                                         | [models.TrackBalancesTier](../models/track-balances-tier.md)[]                  | :heavy_minus_sign:                                                              | Tiered pricing configuration if applicable.                                     |
| `billingUnits`                                                                  | *number*                                                                        | :heavy_check_mark:                                                              | The number of units per billing increment (eg. $9 / 250 units).                 |
| `billingMethod`                                                                 | [models.TrackBalancesBillingMethod](../models/track-balances-billing-method.md) | :heavy_check_mark:                                                              | Whether usage is prepaid or billed pay-per-use.                                 |
| `maxPurchase`                                                                   | *number*                                                                        | :heavy_check_mark:                                                              | Maximum quantity that can be purchased, or null for unlimited.                  |