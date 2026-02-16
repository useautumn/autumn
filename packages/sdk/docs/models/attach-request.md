# AttachRequest

## Example Usage

```typescript
import { AttachRequest } from "@useautumn/sdk";

let value: AttachRequest = {
  productId: "<id>",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `entityId`                                               | *string*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `entityData`                                             | [models.EntityData](../models/entity-data.md)            | :heavy_minus_sign:                                       | N/A                                                      |
| `options`                                                | [models.Options](../models/options.md)[]                 | :heavy_minus_sign:                                       | N/A                                                      |
| `version`                                                | *number*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `freeTrial`                                              | [models.AttachFreeTrial](../models/attach-free-trial.md) | :heavy_minus_sign:                                       | N/A                                                      |
| `items`                                                  | [models.AttachItem](../models/attach-item.md)[]          | :heavy_minus_sign:                                       | N/A                                                      |
| `productId`                                              | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `invoice`                                                | *boolean*                                                | :heavy_minus_sign:                                       | N/A                                                      |
| `enableProductImmediately`                               | *boolean*                                                | :heavy_minus_sign:                                       | N/A                                                      |
| `finalizeInvoice`                                        | *boolean*                                                | :heavy_minus_sign:                                       | N/A                                                      |
| `redirectMode`                                           | [models.RedirectMode](../models/redirect-mode.md)        | :heavy_minus_sign:                                       | N/A                                                      |
| `successUrl`                                             | *string*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `newBillingSubscription`                                 | *boolean*                                                | :heavy_minus_sign:                                       | N/A                                                      |
| `planSchedule`                                           | [models.PlanSchedule](../models/plan-schedule.md)        | :heavy_minus_sign:                                       | N/A                                                      |
| `billingBehavior`                                        | [models.BillingBehavior](../models/billing-behavior.md)  | :heavy_minus_sign:                                       | N/A                                                      |
| `adjustableQuantity`                                     | *boolean*                                                | :heavy_minus_sign:                                       | N/A                                                      |