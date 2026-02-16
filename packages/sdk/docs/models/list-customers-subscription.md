# ListCustomersSubscription

## Example Usage

```typescript
import { ListCustomersSubscription } from "@useautumn/sdk";

let value: ListCustomersSubscription = {
  planId: "<id>",
  autoEnable: true,
  addOn: false,
  status: "active",
  pastDue: true,
  canceledAt: 5507.54,
  expiresAt: 809.35,
  trialEndsAt: 981.36,
  startedAt: 8496.01,
  currentPeriodStart: 2876.92,
  currentPeriodEnd: 7925.22,
  quantity: 2056.51,
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `plan`                                                           | [models.Plan](../models/plan.md)                                 | :heavy_minus_sign:                                               | N/A                                                              |
| `planId`                                                         | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `autoEnable`                                                     | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |
| `addOn`                                                          | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |
| `status`                                                         | [models.ListCustomersStatus](../models/list-customers-status.md) | :heavy_check_mark:                                               | N/A                                                              |
| `pastDue`                                                        | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |
| `canceledAt`                                                     | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `expiresAt`                                                      | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `trialEndsAt`                                                    | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `startedAt`                                                      | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `currentPeriodStart`                                             | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `currentPeriodEnd`                                               | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `quantity`                                                       | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |