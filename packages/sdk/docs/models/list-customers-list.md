# ListCustomersList

## Example Usage

```typescript
import { ListCustomersList } from "@useautumn/sdk";

let value: ListCustomersList = {
  id: "2ee25a41-0d81-4ad2-8451-ec1aadaefe58",
  name: "Patrick",
  email: "patrick@useautumn.com",
  createdAt: 574.97,
  fingerprint: null,
  stripeId: "<id>",
  env: "sandbox",
  metadata: {},
  sendEmailReceipts: true,
  subscriptions: [
    {
      planId: "<id>",
      autoEnable: true,
      addOn: true,
      status: "active",
      pastDue: false,
      canceledAt: 7757.63,
      expiresAt: 8860.2,
      trialEndsAt: 3496.73,
      startedAt: 2246.01,
      currentPeriodStart: 3131.46,
      currentPeriodEnd: 8448.31,
      quantity: 1,
    },
  ],
  purchases: [],
  balances: {
    "messages": {
      featureId: "<id>",
      granted: 100,
      remaining: 0,
      usage: 100,
      unlimited: false,
      overageAllowed: true,
      maxPurchase: 1038.15,
      nextResetAt: 8293.76,
      breakdown: [
        {
          id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
          planId: "<id>",
          includedGrant: 2263.99,
          prepaidGrant: 9888.41,
          remaining: 0,
          usage: 100,
          unlimited: false,
          reset: {
            interval: "month",
            resetsAt: 6608.14,
          },
          price: null,
          expiresAt: null,
        },
      ],
    },
  },
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
| `subscriptions`                                                                                                             | [models.ListCustomersSubscription](../models/list-customers-subscription.md)[]                                              | :heavy_check_mark:                                                                                                          | Active and scheduled recurring plans that this customer has attached.                                                       |
| `purchases`                                                                                                                 | [models.ListCustomersPurchase](../models/list-customers-purchase.md)[]                                                      | :heavy_check_mark:                                                                                                          | One-time purchases made by the customer.                                                                                    |
| `balances`                                                                                                                  | Record<string, [models.Balance](../models/balance.md)>                                                                      | :heavy_check_mark:                                                                                                          | Feature balances keyed by feature ID, showing usage limits and remaining amounts.                                           |