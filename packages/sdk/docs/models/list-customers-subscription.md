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

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan`                                                                 | [models.Plan](../models/plan.md)                                       | :heavy_minus_sign:                                                     | N/A                                                                    |
| `planId`                                                               | *string*                                                               | :heavy_check_mark:                                                     | The unique identifier of the subscribed plan.                          |
| `autoEnable`                                                           | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the plan was automatically enabled for the customer.           |
| `addOn`                                                                | *boolean*                                                              | :heavy_check_mark:                                                     | Whether this is an add-on plan rather than a base subscription.        |
| `status`                                                               | [models.ListCustomersStatus](../models/list-customers-status.md)       | :heavy_check_mark:                                                     | Current status of the subscription.                                    |
| `pastDue`                                                              | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the subscription has overdue payments.                         |
| `canceledAt`                                                           | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription was canceled, or null if not canceled. |
| `expiresAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription will expire, or null if no expiry set. |
| `trialEndsAt`                                                          | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the trial period ends, or null if not on trial.         |
| `startedAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription started.                               |
| `currentPeriodStart`                                                   | *number*                                                               | :heavy_check_mark:                                                     | Start timestamp of the current billing period.                         |
| `currentPeriodEnd`                                                     | *number*                                                               | :heavy_check_mark:                                                     | End timestamp of the current billing period.                           |
| `quantity`                                                             | *number*                                                               | :heavy_check_mark:                                                     | Number of units of this subscription (for per-seat plans).             |