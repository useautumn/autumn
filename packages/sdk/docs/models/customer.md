# Customer

## Example Usage

```typescript
import { Customer } from "@useautumn/sdk";

let value: Customer = {
  name: "John Doe",
  email: "john@example.com",
  fingerprint: "1234567890",
  stripeId: "cus_123",
  env: "sandbox",
  metadata: {},
  sendEmailReceipts: false,
  subscriptions: [
    {
      planId: "plan_123",
      autoEnable: true,
      addOn: false,
      status: "active",
      pastDue: false,
      canceledAt: 9016.07,
      expiresAt: 7919.45,
      trialEndsAt: 9802.8,
      startedAt: 9956.34,
      currentPeriodStart: 4924.95,
      currentPeriodEnd: 7855.7,
      quantity: 1,
    },
  ],
  purchases: [],
  balances: {
    "balance_1": {
      featureId: "<id>",
      granted: 7438.76,
      remaining: 7441.15,
      usage: 5903.02,
      unlimited: true,
      overageAllowed: false,
      maxPurchase: 934.85,
      nextResetAt: 1710.61,
    },
  },
};
```

## Fields

| Field                                                                                                                       | Type                                                                                                                        | Required                                                                                                                    | Description                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                                                      | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | The name of the customer.                                                                                                   |
| `email`                                                                                                                     | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | The email address of the customer.                                                                                          |
| `fingerprint`                                                                                                               | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | A unique identifier (eg. serial number) to de-duplicate customers across devices or browsers. For example: apple device ID. |
| `stripeId`                                                                                                                  | *string*                                                                                                                    | :heavy_check_mark:                                                                                                          | Stripe customer ID.                                                                                                         |
| `env`                                                                                                                       | [models.CustomerEnv](../models/customer-env.md)                                                                             | :heavy_check_mark:                                                                                                          | The environment this customer was created in.                                                                               |
| `metadata`                                                                                                                  | Record<string, *any*>                                                                                                       | :heavy_check_mark:                                                                                                          | The metadata for the customer.                                                                                              |
| `sendEmailReceipts`                                                                                                         | *boolean*                                                                                                                   | :heavy_check_mark:                                                                                                          | Whether to send email receipts to the customer.                                                                             |
| `subscriptions`                                                                                                             | [models.Subscription](../models/subscription.md)[]                                                                          | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `purchases`                                                                                                                 | [models.Purchase](../models/purchase.md)[]                                                                                  | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `balances`                                                                                                                  | Record<string, [models.Balances](../models/balances.md)>                                                                    | :heavy_check_mark:                                                                                                          | N/A                                                                                                                         |
| `invoices`                                                                                                                  | [models.Invoice](../models/invoice.md)[]                                                                                    | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `entities`                                                                                                                  | [models.Entity](../models/entity.md)[]                                                                                      | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `trialsUsed`                                                                                                                | [models.TrialsUsed](../models/trials-used.md)[]                                                                             | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `rewards`                                                                                                                   | [models.Rewards](../models/rewards.md)                                                                                      | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `referrals`                                                                                                                 | [models.Referral](../models/referral.md)[]                                                                                  | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |
| `paymentMethod`                                                                                                             | *any*                                                                                                                       | :heavy_minus_sign:                                                                                                          | N/A                                                                                                                         |