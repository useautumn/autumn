# BillingUpdateItem

## Example Usage

```typescript
import { BillingUpdateItem } from "@useautumn/sdk";

let value: BillingUpdateItem = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `featureId`                                                             | *string*                                                                | :heavy_check_mark:                                                      | N/A                                                                     |
| `included`                                                              | *number*                                                                | :heavy_minus_sign:                                                      | N/A                                                                     |
| `unlimited`                                                             | *boolean*                                                               | :heavy_minus_sign:                                                      | N/A                                                                     |
| `reset`                                                                 | [models.BillingUpdateReset](../models/billing-update-reset.md)          | :heavy_minus_sign:                                                      | N/A                                                                     |
| `price`                                                                 | [models.BillingUpdateItemPrice](../models/billing-update-item-price.md) | :heavy_minus_sign:                                                      | N/A                                                                     |
| `proration`                                                             | [models.BillingUpdateProration](../models/billing-update-proration.md)  | :heavy_minus_sign:                                                      | N/A                                                                     |
| `rollover`                                                              | [models.BillingUpdateRollover](../models/billing-update-rollover.md)    | :heavy_minus_sign:                                                      | N/A                                                                     |