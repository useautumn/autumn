# Subscription

## Example Usage

```typescript
import { Subscription } from "@useautumn/sdk";

let value: Subscription = {
  planId: "<id>",
  autoEnable: true,
  addOn: true,
  status: "scheduled",
  pastDue: true,
  canceledAt: 5647.15,
  expiresAt: 9928.55,
  trialEndsAt: 1811.56,
  startedAt: 1283.35,
  currentPeriodStart: 867.1,
  currentPeriodEnd: 6542.35,
  quantity: 8442.91,
};
```

## Fields

| Field                                | Type                                 | Required                             | Description                          |
| ------------------------------------ | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| `plan`                               | [models.Plan](../models/plan.md)     | :heavy_minus_sign:                   | N/A                                  |
| `planId`                             | *string*                             | :heavy_check_mark:                   | N/A                                  |
| `autoEnable`                         | *boolean*                            | :heavy_check_mark:                   | N/A                                  |
| `addOn`                              | *boolean*                            | :heavy_check_mark:                   | N/A                                  |
| `status`                             | [models.Status](../models/status.md) | :heavy_check_mark:                   | N/A                                  |
| `pastDue`                            | *boolean*                            | :heavy_check_mark:                   | N/A                                  |
| `canceledAt`                         | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `expiresAt`                          | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `trialEndsAt`                        | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `startedAt`                          | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `currentPeriodStart`                 | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `currentPeriodEnd`                   | *number*                             | :heavy_check_mark:                   | N/A                                  |
| `quantity`                           | *number*                             | :heavy_check_mark:                   | N/A                                  |