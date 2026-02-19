# CheckPrice

## Example Usage

```typescript
import { CheckPrice } from "@useautumn/sdk";

let value: CheckPrice = {
  billingUnits: 4264.55,
  billingMethod: "prepaid",
  maxPurchase: 3762.8,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `amount`                                                        | *number*                                                        | :heavy_minus_sign:                                              | The per-unit price amount.                                      |
| `tiers`                                                         | [models.CheckTier](../models/check-tier.md)[]                   | :heavy_minus_sign:                                              | Tiered pricing configuration if applicable.                     |
| `billingUnits`                                                  | *number*                                                        | :heavy_check_mark:                                              | The number of units per billing increment (eg. $9 / 250 units). |
| `billingMethod`                                                 | [models.CheckBillingMethod](../models/check-billing-method.md)  | :heavy_check_mark:                                              | Whether usage is prepaid or billed pay-per-use.                 |
| `maxPurchase`                                                   | *number*                                                        | :heavy_check_mark:                                              | Maximum quantity that can be purchased, or null for unlimited.  |