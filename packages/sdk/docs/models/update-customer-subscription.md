# UpdateCustomerSubscription

## Example Usage

```typescript
import { UpdateCustomerSubscription } from "@useautumn/sdk";

let value: UpdateCustomerSubscription = {
  planId: "<id>",
  autoEnable: false,
  addOn: true,
  status: "scheduled",
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

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `plan`                                                                 | [models.Plan](../models/plan.md)                                       | :heavy_minus_sign:                                                     | N/A                                                                    |
| `planId`                                                               | *string*                                                               | :heavy_check_mark:                                                     | The unique identifier of the subscribed plan.                          |
| `autoEnable`                                                           | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the plan was automatically enabled for the customer.           |
| `addOn`                                                                | *boolean*                                                              | :heavy_check_mark:                                                     | Whether this is an add-on plan rather than a base subscription.        |
| `status`                                                               | [models.UpdateCustomerStatus](../models/update-customer-status.md)     | :heavy_check_mark:                                                     | Current status of the subscription.                                    |
| `pastDue`                                                              | *boolean*                                                              | :heavy_check_mark:                                                     | Whether the subscription has overdue payments.                         |
| `canceledAt`                                                           | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription was canceled, or null if not canceled. |
| `expiresAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription will expire, or null if no expiry set. |
| `trialEndsAt`                                                          | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the trial period ends, or null if not on trial.         |
| `startedAt`                                                            | *number*                                                               | :heavy_check_mark:                                                     | Timestamp when the subscription started.                               |
| `currentPeriodStart`                                                   | *number*                                                               | :heavy_check_mark:                                                     | Start timestamp of the current billing period.                         |
| `currentPeriodEnd`                                                     | *number*                                                               | :heavy_check_mark:                                                     | End timestamp of the current billing period.                           |
| `quantity`                                                             | *number*                                                               | :heavy_check_mark:                                                     | Number of units of this subscription (for per-seat plans).             |