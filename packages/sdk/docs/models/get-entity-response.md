# GetEntityResponse

OK

## Example Usage

```typescript
import { GetEntityResponse } from "@useautumn/sdk";

let value: GetEntityResponse = {
  id: "seat_42",
  name: "Seat 42",
  customerId: "cus_123",
  featureId: "seats",
  createdAt: 1771409161016,
  env: "sandbox",
  subscriptions: [
    {
      planId: "pro_plan",
      autoEnable: true,
      addOn: false,
      status: "active",
      pastDue: false,
      canceledAt: null,
      expiresAt: null,
      trialEndsAt: null,
      startedAt: 1771431921437,
      currentPeriodStart: 1771431921437,
      currentPeriodEnd: 1771999921437,
      quantity: 1,
    },
  ],
  purchases: [],
  balances: {
    "messages": {
      featureId: "messages",
      granted: 100,
      remaining: 72,
      usage: 28,
      unlimited: false,
      overageAllowed: false,
      maxPurchase: null,
      nextResetAt: 1773851121437,
      breakdown: [
        {
          id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
          planId: "pro_plan",
          includedGrant: 100,
          prepaidGrant: 0,
          remaining: 72,
          usage: 28,
          unlimited: false,
          reset: {
            interval: "month",
            resetsAt: 1773851121437,
          },
          price: null,
          expiresAt: null,
        },
      ],
    },
  },
  invoices: [],
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `autumnId`                                                                   | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `id`                                                                         | *string*                                                                     | :heavy_check_mark:                                                           | The unique identifier of the entity                                          |
| `name`                                                                       | *string*                                                                     | :heavy_check_mark:                                                           | The name of the entity                                                       |
| `customerId`                                                                 | *string*                                                                     | :heavy_minus_sign:                                                           | The customer ID this entity belongs to                                       |
| `featureId`                                                                  | *string*                                                                     | :heavy_minus_sign:                                                           | The feature ID this entity belongs to                                        |
| `createdAt`                                                                  | *number*                                                                     | :heavy_check_mark:                                                           | Unix timestamp when the entity was created                                   |
| `env`                                                                        | [models.GetEntityEnv](../models/get-entity-env.md)                           | :heavy_check_mark:                                                           | The environment (sandbox/live)                                               |
| `subscriptions`                                                              | [models.GetEntitySubscription](../models/get-entity-subscription.md)[]       | :heavy_check_mark:                                                           | N/A                                                                          |
| `purchases`                                                                  | [models.GetEntityPurchase](../models/get-entity-purchase.md)[]               | :heavy_check_mark:                                                           | N/A                                                                          |
| `balances`                                                                   | Record<string, [models.GetEntityBalances](../models/get-entity-balances.md)> | :heavy_check_mark:                                                           | N/A                                                                          |
| `invoices`                                                                   | [models.GetEntityInvoice](../models/get-entity-invoice.md)[]                 | :heavy_minus_sign:                                                           | Invoices for this entity (only included when expand=invoices)                |