# BillingPreviewUpdateLineItem

## Example Usage

```typescript
import { BillingPreviewUpdateLineItem } from "@useautumn/sdk";

let value: BillingPreviewUpdateLineItem = {
  title: "<value>",
  description:
    "nun uh-huh clonk towards forenenst major yum justly young brand",
  amount: 4163.79,
  totalQuantity: 7156.63,
  paidQuantity: 2381.01,
  planId: "<id>",
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `title`                                                                                            | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `description`                                                                                      | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `amount`                                                                                           | *number*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `discounts`                                                                                        | [models.BillingPreviewUpdateDiscount](../models/billing-preview-update-discount.md)[]              | :heavy_minus_sign:                                                                                 | N/A                                                                                                |
| `isBase`                                                                                           | *boolean*                                                                                          | :heavy_minus_sign:                                                                                 | N/A                                                                                                |
| `totalQuantity`                                                                                    | *number*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `paidQuantity`                                                                                     | *number*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `planId`                                                                                           | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `deferredForTrial`                                                                                 | *boolean*                                                                                          | :heavy_minus_sign:                                                                                 | N/A                                                                                                |
| `effectivePeriod`                                                                                  | [models.BillingPreviewUpdateEffectivePeriod](../models/billing-preview-update-effective-period.md) | :heavy_minus_sign:                                                                                 | N/A                                                                                                |