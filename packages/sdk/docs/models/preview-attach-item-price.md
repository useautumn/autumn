# PreviewAttachItemPrice

## Example Usage

```typescript
import { PreviewAttachItemPrice } from "@useautumn/sdk";

let value: PreviewAttachItemPrice = {
  interval: "semi_annual",
  billingMethod: "prepaid",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `tiers`                                                                                  | [models.PreviewAttachTier](../models/preview-attach-tier.md)[]                           | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `interval`                                                                               | [models.PreviewAttachItemPriceInterval](../models/preview-attach-item-price-interval.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingUnits`                                                                           | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingMethod`                                                                          | [models.PreviewAttachBillingMethod](../models/preview-attach-billing-method.md)          | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `maxPurchase`                                                                            | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |