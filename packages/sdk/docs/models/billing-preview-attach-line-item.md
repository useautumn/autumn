# BillingPreviewAttachLineItem

## Example Usage

```typescript
import { BillingPreviewAttachLineItem } from "@useautumn/sdk";

let value: BillingPreviewAttachLineItem = {
  title: "<value>",
  description:
    "anti plagiarise why gah bludgeon from whoever experience celsius",
  amount: 9045.15,
  planId: "<id>",
  totalQuantity: 8695.78,
  paidQuantity: 1093.11,
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `title`                                                                                                | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `description`                                                                                          | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `amount`                                                                                               | *number*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `discounts`                                                                                            | [models.BillingPreviewAttachDiscountResponse](../models/billing-preview-attach-discount-response.md)[] | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `planId`                                                                                               | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `totalQuantity`                                                                                        | *number*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `paidQuantity`                                                                                         | *number*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `deferredForTrial`                                                                                     | *boolean*                                                                                              | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `effectivePeriod`                                                                                      | [models.BillingPreviewAttachEffectivePeriod](../models/billing-preview-attach-effective-period.md)     | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `isBase`                                                                                               | *boolean*                                                                                              | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |