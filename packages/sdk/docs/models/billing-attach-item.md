# BillingAttachItem

## Example Usage

```typescript
import { BillingAttachItem } from "@useautumn/sdk";

let value: BillingAttachItem = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `featureId`                                                             | *string*                                                                | :heavy_check_mark:                                                      | N/A                                                                     |
| `included`                                                              | *number*                                                                | :heavy_minus_sign:                                                      | N/A                                                                     |
| `unlimited`                                                             | *boolean*                                                               | :heavy_minus_sign:                                                      | N/A                                                                     |
| `reset`                                                                 | [models.BillingAttachReset](../models/billing-attach-reset.md)          | :heavy_minus_sign:                                                      | N/A                                                                     |
| `price`                                                                 | [models.BillingAttachItemPrice](../models/billing-attach-item-price.md) | :heavy_minus_sign:                                                      | N/A                                                                     |
| `proration`                                                             | [models.BillingAttachProration](../models/billing-attach-proration.md)  | :heavy_minus_sign:                                                      | N/A                                                                     |
| `rollover`                                                              | [models.BillingAttachRollover](../models/billing-attach-rollover.md)    | :heavy_minus_sign:                                                      | N/A                                                                     |