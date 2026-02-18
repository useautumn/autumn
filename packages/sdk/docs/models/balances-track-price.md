# BalancesTrackPrice

## Example Usage

```typescript
import { BalancesTrackPrice } from "@useautumn/sdk";

let value: BalancesTrackPrice = {
  billingUnits: 277.53,
  billingMethod: "prepaid",
  maxPurchase: 7619.94,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_minus_sign:                                                              | N/A                                                                             |
| `tiers`                                                                         | [models.BalancesTrackTier](../models/balances-track-tier.md)[]                  | :heavy_minus_sign:                                                              | N/A                                                                             |
| `billingUnits`                                                                  | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `billingMethod`                                                                 | [models.BalancesTrackBillingMethod](../models/balances-track-billing-method.md) | :heavy_check_mark:                                                              | N/A                                                                             |
| `maxPurchase`                                                                   | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |