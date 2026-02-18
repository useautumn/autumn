# BalancesCheckPrice

## Example Usage

```typescript
import { BalancesCheckPrice } from "@useautumn/sdk";

let value: BalancesCheckPrice = {
  billingUnits: 1045.14,
  billingMethod: "usage_based",
  maxPurchase: 7190.36,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_minus_sign:                                                              | N/A                                                                             |
| `tiers`                                                                         | [models.BalancesCheckTier](../models/balances-check-tier.md)[]                  | :heavy_minus_sign:                                                              | N/A                                                                             |
| `billingUnits`                                                                  | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `billingMethod`                                                                 | [models.BalancesCheckBillingMethod](../models/balances-check-billing-method.md) | :heavy_check_mark:                                                              | N/A                                                                             |
| `maxPurchase`                                                                   | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |