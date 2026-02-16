# UpdateCustomerResponse

OK

## Example Usage

```typescript
import { UpdateCustomerResponse } from "@useautumn/sdk";

let value: UpdateCustomerResponse = {
  id: "<id>",
  name: "<value>",
  email: "Nella63@yahoo.com",
  createdAt: 1601.1,
  fingerprint: "<value>",
  stripeId: "<id>",
  env: "live",
  metadata: {
    "key": "<value>",
    "key1": "<value>",
  },
  sendEmailReceipts: true,
  subscriptions: [
    {
      planId: "<id>",
      autoEnable: false,
      addOn: true,
      status: "scheduled",
      pastDue: true,
      canceledAt: 4476.93,
      expiresAt: 6114.93,
      trialEndsAt: 8136.42,
      startedAt: 3369.97,
      currentPeriodStart: 7857.72,
      currentPeriodEnd: 200.12,
      quantity: 8649.92,
    },
  ],
  purchases: [],
  balances: {},
};
```

## Fields

| Field                                                                                                                       | Type                                                                                                                        | Required                                                                                                                    | Description                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                        | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | Your unique identifier for the customer.                                                                                    |
| `name`                                                                                                                      | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | The name of the customer.                                                                                                   |
| `email`                                                                                                                     | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | The email address of the customer.                                                                                          |
| `createdAt`                                                                                                                 | *number*                                                                                                                    | :heavy_check_mark:                                                                                                          | Timestamp of customer creation in milliseconds since epoch.                                                                 |
| `fingerprint`                                                                                                               | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | A unique identifier (eg. serial number) to de-duplicate customers across devices or browsers. For example: apple device ID. |
| `stripeId`                                                                                                                  | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | Stripe customer ID.                                                                                                         |
| `env`                                                                                                                       | [models.UpdateCustomerEnv](../models/update-customer-env.md)                                                                | :heavy_check_mark:                                                                                                          | The environment this customer was created in.                                                                               |
| `metadata`                                                                                                                  | Record<string, *any*>                                                                                                       | :heavy_check_mark:                                                                                                          | The metadata for the customer.                                                                                              |
| `sendEmailReceipts`                                                                                                         | *boolean*                                                                                                                   | :heavy_check_mark:                                                                                                          | Whether to send email receipts to the customer.                                                                             |
| `subscriptions`                                                                                                             | [models.UpdateCustomerSubscription](../models/update-customer-subscription.md)[]                                            | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `purchases`                                                                                                                 | [models.UpdateCustomerPurchase](../models/update-customer-purchase.md)[]                                                    | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `balances`                                                                                                                  | Record<string, [models.UpdateCustomerBalances](../models/update-customer-balances.md)>                                      | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |