# BillingUpdateItemPrice

## Example Usage

```typescript
import { BillingUpdateItemPrice } from "@useautumn/sdk";

let value: BillingUpdateItemPrice = {
  interval: "semi_annual",
  billingMethod: "usage_based",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `tiers`                                                                                  | [models.BillingUpdateTier](../models/billing-update-tier.md)[]                           | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `interval`                                                                               | [models.BillingUpdateItemPriceInterval](../models/billing-update-item-price-interval.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingUnits`                                                                           | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingMethod`                                                                          | [models.BillingUpdateBillingMethod](../models/billing-update-billing-method.md)          | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `maxPurchase`                                                                            | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |