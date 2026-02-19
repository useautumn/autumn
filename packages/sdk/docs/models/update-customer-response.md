# UpdateCustomerResponse

OK

## Example Usage

```typescript
import { UpdateCustomerResponse } from "@useautumn/sdk";

let value: UpdateCustomerResponse = {
  id: "2ee25a41-0d81-4ad2-8451-ec1aadaefe58",
  name: "Patrick",
  email: "patrick@useautumn.com",
  createdAt: 7471.06,
  fingerprint: null,
  stripeId: "<id>",
  env: "sandbox",
  metadata: {},
  sendEmailReceipts: true,
  subscriptions: [
    {
      planId: "<id>",
      autoEnable: true,
      addOn: false,
      status: "active",
      pastDue: false,
      canceledAt: 4772.78,
      expiresAt: 8368.77,
      trialEndsAt: 7907.84,
      startedAt: 6480.13,
      currentPeriodStart: 7337.08,
      currentPeriodEnd: 7245.4,
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
      overageAllowed: false,
      maxPurchase: 6641.52,
      nextResetAt: 2397.96,
      breakdown: [
        {
          id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
          planId: "<id>",
          includedGrant: 7896.98,
          prepaidGrant: 6114.93,
          remaining: 0,
          usage: 100,
          unlimited: false,
          reset: {
            interval: "month",
            resetsAt: 8136.42,
          },
          price: null,
          expiresAt: 8820.39,
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
| `env`                                                                                                                       | [models.UpdateCustomerEnv](../models/update-customer-env.md)                                                                | :heavy_check_mark:                                                                                                          | The environment this customer was created in.                                                                               |
| `metadata`                                                                                                                  | Record<string, *any*>                                                                                                       | :heavy_check_mark:                                                                                                          | The metadata for the customer.                                                                                              |
| `sendEmailReceipts`                                                                                                         | *boolean*                                                                                                                   | :heavy_check_mark:                                                                                                          | Whether to send email receipts to the customer.                                                                             |
| `subscriptions`                                                                                                             | [models.UpdateCustomerSubscription](../models/update-customer-subscription.md)[]                                            | :heavy_check_mark:                                                                                                          | Active and scheduled recurring plans that this customer has attached.                                                       |
| `purchases`                                                                                                                 | [models.UpdateCustomerPurchase](../models/update-customer-purchase.md)[]                                                    | :heavy_check_mark:                                                                                                          | One-time purchases made by the customer.                                                                                    |
| `balances`                                                                                                                  | Record<string, [models.UpdateCustomerBalances](../models/update-customer-balances.md)>                                      | :heavy_check_mark:                                                                                                          | Feature balances keyed by feature ID, showing usage limits and remaining amounts.                                           |