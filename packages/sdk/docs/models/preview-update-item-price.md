# PreviewUpdateItemPrice

## Example Usage

```typescript
import { PreviewUpdateItemPrice } from "@useautumn/sdk";

let value: PreviewUpdateItemPrice = {
  interval: "one_off",
  billingMethod: "usage_based",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `tiers`                                                                                  | [models.PreviewUpdateTier](../models/preview-update-tier.md)[]                           | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `interval`                                                                               | [models.PreviewUpdateItemPriceInterval](../models/preview-update-item-price-interval.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingUnits`                                                                           | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingMethod`                                                                          | [models.PreviewUpdateBillingMethod](../models/preview-update-billing-method.md)          | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `maxPurchase`                                                                            | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |