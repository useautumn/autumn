# GetEntitySubscription

## Example Usage

```typescript
import { GetEntitySubscription } from "@useautumn/sdk";

let value: GetEntitySubscription = {
  planId: "<id>",
  autoEnable: false,
  addOn: false,
  status: "scheduled",
  pastDue: true,
  canceledAt: 3931.12,
  expiresAt: 5373.3,
  trialEndsAt: 2145.3,
  startedAt: 7157.85,
  currentPeriodStart: 9214.48,
  currentPeriodEnd: 6937.83,
  quantity: 2176.73,
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan`                                                                 | [models.Plan](../models/plan.md)                                       | :heavy_minus_sign:                                                     | N/A                                                                    |
| `planId`                                                               | *string*                                                               | :heavy_check_mark:                                                     | The unique identifier of the subscribed plan.                          |
| `autoEnable`                                                           | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the plan was automatically enabled for the customer.           |
| `addOn`                                                                | *boolean*                                                              | :heavy_check_mark:                                                     | Whether this is an add-on plan rather than a base subscription.        |
| `status`                                                               | [models.GetEntityStatus](../models/get-entity-status.md)               | :heavy_check_mark:                                                     | Current status of the subscription.                                    |
| `pastDue`                                                              | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the subscription has overdue payments.                         |
| `canceledAt`                                                           | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription was canceled, or null if not canceled. |
| `expiresAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription will expire, or null if no expiry set. |
| `trialEndsAt`                                                          | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the trial period ends, or null if not on trial.         |
| `startedAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription started.                               |
| `currentPeriodStart`                                                   | *number*                                                               | :heavy_check_mark:                                                     | Start timestamp of the current billing period.                         |
| `currentPeriodEnd`                                                     | *number*                                                               | :heavy_check_mark:                                                     | End timestamp of the current billing period.                           |
| `quantity`                                                             | *number*                                                               | :heavy_check_mark:                                                     | Number of units of this subscription (for per-seat plans).             |