# CreateEntitySubscription

## Example Usage

```typescript
import { CreateEntitySubscription } from "@useautumn/sdk";

let value: CreateEntitySubscription = {
  planId: "<id>",
  autoEnable: false,
  addOn: false,
  status: "active",
  pastDue: false,
  canceledAt: 5661.83,
  expiresAt: null,
  trialEndsAt: 9861.97,
  startedAt: 3108.66,
  currentPeriodStart: 1951.21,
  currentPeriodEnd: 6302.47,
  quantity: 3052.58,
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan`                                                                 | [models.Plan](../models/plan.md)                                       | :heavy_minus_sign:                                                     | N/A                                                                    |
| `planId`                                                               | *string*                                                               | :heavy_check_mark:                                                     | The unique identifier of the subscribed plan.                          |
| `autoEnable`                                                           | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the plan was automatically enabled for the customer.           |
| `addOn`                                                                | *boolean*                                                              | :heavy_check_mark:                                                     | Whether this is an add-on plan rather than a base subscription.        |
| `status`                                                               | [models.CreateEntityStatus](../models/create-entity-status.md)         | :heavy_check_mark:                                                     | Current status of the subscription.                                    |
| `pastDue`                                                              | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the subscription has overdue payments.                         |
| `canceledAt`                                                           | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription was canceled, or null if not canceled. |
| `expiresAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription will expire, or null if no expiry set. |
| `trialEndsAt`                                                          | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the trial period ends, or null if not on trial.         |
| `startedAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription started.                               |
| `currentPeriodStart`                                                   | *number*                                                               | :heavy_check_mark:                                                     | Start timestamp of the current billing period.                         |
| `currentPeriodEnd`                                                     | *number*                                                               | :heavy_check_mark:                                                     | End timestamp of the current billing period.                           |
| `quantity`                                                             | *number*                                                               | :heavy_check_mark:                                                     | Number of units of this subscription (for per-seat plans).             |