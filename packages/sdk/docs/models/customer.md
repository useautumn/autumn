# Customer

## Example Usage

```typescript
import { Customer } from "@useautumn/sdk";

let value: Customer = {
  id: "<id>",
  name: null,
  email: "Kevin73@hotmail.com",
  createdAt: 9956.34,
  fingerprint: "<value>",
  stripeId: "<id>",
  env: "live",
  metadata: {
    "key": "<value>",
    "key1": "<value>",
    "key2": "<value>",
  },
  sendEmailReceipts: false,
  subscriptions: [
    {
      planId: "<id>",
      autoEnable: false,
      addOn: true,
      status: "expired",
      pastDue: true,
      canceledAt: null,
      expiresAt: 1710.61,
      trialEndsAt: 8042.54,
      startedAt: 72.25,
      currentPeriodStart: 8651.43,
      currentPeriodEnd: 7213.89,
      quantity: 3438,
    },
  ],
  purchases: [],
  balances: {
    "key": {
      featureId: "<id>",
      granted: 3195.9,
      remaining: 3289.89,
      usage: 4599.27,
      unlimited: false,
      overageAllowed: false,
      maxPurchase: 1182.05,
      nextResetAt: 5644.6,
    },
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `autumnId`                                               | *string*                                                 | :heavy_minus_sign:                                       | N/A                                                      |
| `id`                                                     | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `name`                                                   | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `email`                                                  | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `createdAt`                                              | *number*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `fingerprint`                                            | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `stripeId`                                               | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `env`                                                    | [models.CustomerEnv](../models/customer-env.md)          | :heavy_check_mark:                                       | N/A                                                      |
| `metadata`                                               | Record<string, *any*>                                    | :heavy_check_mark:                                       | N/A                                                      |
| `sendEmailReceipts`                                      | *boolean*                                                | :heavy_check_mark:                                       | N/A                                                      |
| `subscriptions`                                          | [models.Subscription](../models/subscription.md)[]       | :heavy_check_mark:                                       | N/A                                                      |
| `purchases`                                              | [models.Purchase](../models/purchase.md)[]               | :heavy_check_mark:                                       | N/A                                                      |
| `balances`                                               | Record<string, [models.Balances](../models/balances.md)> | :heavy_check_mark:                                       | N/A                                                      |
| `invoices`                                               | [models.Invoice](../models/invoice.md)[]                 | :heavy_minus_sign:                                       | N/A                                                      |
| `entities`                                               | [models.Entity](../models/entity.md)[]                   | :heavy_minus_sign:                                       | N/A                                                      |
| `trialsUsed`                                             | [models.TrialsUsed](../models/trials-used.md)[]          | :heavy_minus_sign:                                       | N/A                                                      |
| `rewards`                                                | [models.Rewards](../models/rewards.md)                   | :heavy_minus_sign:                                       | N/A                                                      |
| `referrals`                                              | [models.Referral](../models/referral.md)[]               | :heavy_minus_sign:                                       | N/A                                                      |
| `paymentMethod`                                          | *any*                                                    | :heavy_minus_sign:                                       | N/A                                                      |