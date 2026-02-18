# BillingPreviewUpdateItem

## Example Usage

```typescript
import { BillingPreviewUpdateItem } from "@useautumn/sdk";

let value: BillingPreviewUpdateItem = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `featureId`                                                                            | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `included`                                                                             | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `unlimited`                                                                            | *boolean*                                                                              | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `reset`                                                                                | [models.BillingPreviewUpdateReset](../models/billing-preview-update-reset.md)          | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `price`                                                                                | [models.BillingPreviewUpdateItemPrice](../models/billing-preview-update-item-price.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `proration`                                                                            | [models.BillingPreviewUpdateProration](../models/billing-preview-update-proration.md)  | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `rollover`                                                                             | [models.BillingPreviewUpdateRollover](../models/billing-preview-update-rollover.md)    | :heavy_minus_sign:                                                                     | N/A                                                                                    |