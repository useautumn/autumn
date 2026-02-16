# UpdateCustomerSubscription

## Example Usage

```typescript
import { UpdateCustomerSubscription } from "@useautumn/sdk";

let value: UpdateCustomerSubscription = {
  planId: "<id>",
  autoEnable: false,
  addOn: true,
  status: "expired",
  pastDue: false,
  canceledAt: 7892.35,
  expiresAt: 6728.93,
  trialEndsAt: 4150.88,
  startedAt: 3796.87,
  currentPeriodStart: 3910.6,
  currentPeriodEnd: 2894.6,
  quantity: 8676.33,
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `plan`                                                             | [models.Plan](../models/plan.md)                                   | :heavy_minus_sign:                                                 | N/A                                                                |
| `planId`                                                           | *string*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `autoEnable`                                                       | *boolean*                                                          | :heavy_check_mark:                                                 | N/A                                                                |
| `addOn`                                                            | *boolean*                                                          | :heavy_check_mark:                                                 | N/A                                                                |
| `status`                                                           | [models.UpdateCustomerStatus](../models/update-customer-status.md) | :heavy_check_mark:                                                 | N/A                                                                |
| `pastDue`                                                          | *boolean*                                                          | :heavy_check_mark:                                                 | N/A                                                                |
| `canceledAt`                                                       | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `expiresAt`                                                        | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `trialEndsAt`                                                      | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `startedAt`                                                        | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `currentPeriodStart`                                               | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `currentPeriodEnd`                                                 | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `quantity`                                                         | *number*                                                           | :heavy_check_mark:                                                 | N/A                                                                |