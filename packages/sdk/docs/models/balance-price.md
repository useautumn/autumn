# BalancePrice

## Example Usage

```typescript
import { BalancePrice } from "@useautumn/sdk";

let value: BalancePrice = {
  billingUnits: 6600.52,
  billingMethod: "prepaid",
  maxPurchase: 2734.09,
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `amount`                                                           | *number*                                                           | :heavy_minus_sign:                                                 | The per-unit price amount.                                         |
| `tiers`                                                            | [models.BalanceTier](../models/balance-tier.md)[]                  | :heavy_minus_sign:                                                 | Tiered pricing configuration if applicable.                        |
| `billingUnits`                                                     | *number*                                                           | :heavy_check_mark:                                                 | The number of units per billing increment (eg. $9 / 250 units).    |
| `billingMethod`                                                    | [models.BalanceBillingMethod](../models/balance-billing-method.md) | :heavy_check_mark:                                                 | Whether usage is prepaid or billed pay-per-use.                    |
| `maxPurchase`                                                      | *number*                                                           | :heavy_check_mark:                                                 | Maximum quantity that can be purchased, or null for unlimited.     |