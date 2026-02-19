# Customer

## Example Usage

```typescript
import { Customer } from "@useautumn/sdk";

let value: Customer = {
  id: "2ee25a41-0d81-4ad2-8451-ec1aadaefe58",
  name: "Patrick",
  email: "patrick@useautumn.com",
  createdAt: 8386.3,
  fingerprint: null,
  stripeId: null,
  env: "sandbox",
  metadata: {},
  sendEmailReceipts: false,
  subscriptions: [
    {
      planId: "<id>",
      autoEnable: false,
      addOn: false,
      status: "active",
      pastDue: false,
      canceledAt: 7919.45,
      expiresAt: 9802.8,
      trialEndsAt: 3055.97,
      startedAt: 4924.95,
      currentPeriodStart: 7855.7,
      currentPeriodEnd: 7441.15,
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
      maxPurchase: 8444.68,
      nextResetAt: 934.85,
      breakdown: [
        {
          id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
          planId: "<id>",
          includedGrant: 1710.61,
          prepaidGrant: 3221.05,
          remaining: 0,
          usage: 100,
          unlimited: false,
          reset: {
            interval: "month",
            resetsAt: 72.25,
          },
          price: null,
          expiresAt: 8651.43,
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
| `env`                                                                                                                       | [models.CustomerEnv](../models/customer-env.md)                                                                             | :heavy_check_mark:                                                                                                          | The environment this customer was created in.                                                                               |
| `metadata`                                                                                                                  | Record<string, *any*>                                                                                                       | :heavy_check_mark:                                                                                                          | The metadata for the customer.                                                                                              |
| `sendEmailReceipts`                                                                                                         | *boolean*                                                                                                                   | :heavy_check_mark:                                                                                                          | Whether to send email receipts to the customer.                                                                             |
| `subscriptions`                                                                                                             | [models.Subscription](../models/subscription.md)[]                                                                          | :heavy_check_mark:                                                                                                          | Active and scheduled recurring plans that this customer has attached.                                                       |
| `purchases`                                                                                                                 | [models.Purchase](../models/purchase.md)[]                                                                                  | :heavy_check_mark:                                                                                                          | One-time purchases made by the customer.                                                                                    |
| `balances`                                                                                                                  | Record<string, [models.Balances](../models/balances.md)>                                                                    | :heavy_check_mark:                                                                                                          | Feature balances keyed by feature ID, showing usage limits and remaining amounts.                                           |
| `invoices`                                                                                                                  | [models.Invoice](../models/invoice.md)[]                                                                                    | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `entities`                                                                                                                  | [models.Entity](../models/entity.md)[]                                                                                      | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `trialsUsed`                                                                                                                | [models.TrialsUsed](../models/trials-used.md)[]                                                                             | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `rewards`                                                                                                                   | [models.Rewards](../models/rewards.md)                                                                                      | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `referrals`                                                                                                                 | [models.Referral](../models/referral.md)[]                                                                                  | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `paymentMethod`                                                                                                             | *any*                                                                                                                       | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |