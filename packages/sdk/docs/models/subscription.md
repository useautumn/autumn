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

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan`                                                                 | [models.Plan](../models/plan.md)                                       | :heavy_minus_sign:                                                     | N/A                                                                    |
| `planId`                                                               | *string*                                                               | :heavy_check_mark:                                                     | The unique identifier of the subscribed plan.                          |
| `autoEnable`                                                           | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the plan was automatically enabled for the customer.           |
| `addOn`                                                                | *boolean*                                                              | :heavy_check_mark:                                                     | Whether this is an add-on plan rather than a base subscription.        |
| `status`                                                               | [models.Status](../models/status.md)                                   | :heavy_check_mark:                                                     | Current status of the subscription.                                    |
| `pastDue`                                                              | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the subscription has overdue payments.                         |
| `canceledAt`                                                           | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription was canceled, or null if not canceled. |
| `expiresAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription will expire, or null if no expiry set. |
| `trialEndsAt`                                                          | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the trial period ends, or null if not on trial.         |
| `startedAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription started.                               |
| `currentPeriodStart`                                                   | *number*                                                               | :heavy_check_mark:                                                     | Start timestamp of the current billing period.                         |
| `currentPeriodEnd`                                                     | *number*                                                               | :heavy_check_mark:                                                     | End timestamp of the current billing period.                           |
| `quantity`                                                             | *number*                                                               | :heavy_check_mark:                                                     | Number of units of this subscription (for per-seat plans).             |