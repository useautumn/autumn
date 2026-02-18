# BillingPreviewUpdateItemPrice

## Example Usage

```typescript
import { BillingPreviewUpdateItemPrice } from "@useautumn/sdk";

let value: BillingPreviewUpdateItemPrice = {
  interval: "week",
  billingMethod: "prepaid",
};
```

## Fields

| Field                                                                                                   | Type                                                                                                    | Required                                                                                                | Description                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `amount`                                                                                                | *number*                                                                                                | :heavy_minus_sign:                                                                                      | N/A                                                                                                     |
| `tiers`                                                                                                 | [models.BillingPreviewUpdateTier](../models/billing-preview-update-tier.md)[]                           | :heavy_minus_sign:                                                                                      | N/A                                                                                                     |
| `interval`                                                                                              | [models.BillingPreviewUpdateItemPriceInterval](../models/billing-preview-update-item-price-interval.md) | :heavy_check_mark:                                                                                      | N/A                                                                                                     |
| `intervalCount`                                                                                         | *number*                                                                                                | :heavy_minus_sign:                                                                                      | N/A                                                                                                     |
| `billingUnits`                                                                                          | *number*                                                                                                | :heavy_minus_sign:                                                                                      | N/A                                                                                                     |
| `billingMethod`                                                                                         | [models.BillingPreviewUpdateBillingMethod](../models/billing-preview-update-billing-method.md)          | :heavy_check_mark:                                                                                      | N/A                                                                                                     |
| `maxPurchase`                                                                                           | *number*                                                                                                | :heavy_minus_sign:                                                                                      | N/A                                                                                                     |