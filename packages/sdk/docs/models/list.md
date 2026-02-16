# List

## Example Usage

```typescript
import { List } from "@useautumn/sdk";

let value: List = {
  id: "<id>",
  name: "<value>",
  email: "Cole_Kuhn@gmail.com",
  createdAt: 9730.61,
  fingerprint: "<value>",
  stripeId: "<id>",
  env: "live",
  metadata: {
    "key": "<value>",
  },
  sendEmailReceipts: true,
  subscriptions: [],
  purchases: [
    {
      planId: "<id>",
      expiresAt: 4940.05,
      startedAt: 1235.42,
      quantity: 3895.4,
    },
  ],
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
| `env`                                                                                                                       | [models.ListCustomersEnv](../models/list-customers-env.md)                                                                  | :heavy_check_mark:                                                                                                          | The environment this customer was created in.                                                                               |
| `metadata`                                                                                                                  | Record<string, *any*>                                                                                                       | :heavy_check_mark:                                                                                                          | The metadata for the customer.                                                                                              |
| `sendEmailReceipts`                                                                                                         | *boolean*                                                                                                                   | :heavy_check_mark:                                                                                                          | Whether to send email receipts to the customer.                                                                             |
| `subscriptions`                                                                                                             | [models.ListCustomersSubscription](../models/list-customers-subscription.md)[]                                              | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `purchases`                                                                                                                 | [models.ListCustomersPurchase](../models/list-customers-purchase.md)[]                                                      | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `balances`                                                                                                                  | Record<string, [models.ListCustomersBalances](../models/list-customers-balances.md)>                                        | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |