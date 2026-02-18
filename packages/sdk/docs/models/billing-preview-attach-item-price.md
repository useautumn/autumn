# BillingPreviewAttachItemPrice

## Example Usage

```typescript
import { BillingPreviewAttachItemPrice } from "@useautumn/sdk";

let value: BillingPreviewAttachItemPrice = {
  interval: "quarter",
  billingMethod: "usage_based",
};
```

## Fields

| Field                                                                                                         | Type                                                                                                          | Required                                                                                                      | Description                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `amount`                                                                                                      | *number*                                                                                                      | :heavy_minus_sign:                                                                                            | N/A                                                                                                           |
| `tiers`                                                                                                       | [models.BillingPreviewAttachTierRequest](../models/billing-preview-attach-tier-request.md)[]                  | :heavy_minus_sign:                                                                                            | N/A                                                                                                           |
| `interval`                                                                                                    | [models.BillingPreviewAttachItemPriceInterval](../models/billing-preview-attach-item-price-interval.md)       | :heavy_check_mark:                                                                                            | N/A                                                                                                           |
| `intervalCount`                                                                                               | *number*                                                                                                      | :heavy_minus_sign:                                                                                            | N/A                                                                                                           |
| `billingUnits`                                                                                                | *number*                                                                                                      | :heavy_minus_sign:                                                                                            | N/A                                                                                                           |
| `billingMethod`                                                                                               | [models.BillingPreviewAttachBillingMethodRequest](../models/billing-preview-attach-billing-method-request.md) | :heavy_check_mark:                                                                                            | N/A                                                                                                           |
| `maxPurchase`                                                                                                 | *number*                                                                                                      | :heavy_minus_sign:                                                                                            | N/A                                                                                                           |