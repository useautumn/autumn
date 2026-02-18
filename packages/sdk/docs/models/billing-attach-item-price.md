# BillingAttachItemPrice

## Example Usage

```typescript
import { BillingAttachItemPrice } from "@useautumn/sdk";

let value: BillingAttachItemPrice = {
  interval: "week",
  billingMethod: "usage_based",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `tiers`                                                                                  | [models.BillingAttachTier](../models/billing-attach-tier.md)[]                           | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `interval`                                                                               | [models.BillingAttachItemPriceInterval](../models/billing-attach-item-price-interval.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingUnits`                                                                           | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `billingMethod`                                                                          | [models.BillingAttachBillingMethod](../models/billing-attach-billing-method.md)          | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `maxPurchase`                                                                            | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |