# Incoming

## Example Usage

```typescript
import { Incoming } from "@useautumn/sdk";

let value: Incoming = {
  plan: {
    id: "<id>",
    name: "<value>",
    description: "very neaten definitive psst geez times gah",
    group: "<value>",
    version: 762.38,
    addOn: false,
    autoEnable: true,
    price: {
      amount: 3075.99,
      interval: "one_off",
    },
    items: [
      {
        featureId: "<id>",
        included: 7842.81,
        unlimited: false,
        reset: {
          interval: "year",
        },
        price: {
          interval: "one_off",
          billingUnits: 5268.83,
          billingMethod: "usage_based",
          maxPurchase: 9846.03,
        },
      },
    ],
    createdAt: 7030.5,
    env: "live",
    archived: true,
    baseVariantId: "<id>",
  },
  featureQuantities: [
    {
      featureId: "<id>",
      quantity: 4242.71,
    },
  ],
  balances: {
    "key": {
      object: "balance",
      featureId: "<id>",
      granted: 3858.89,
      remaining: 9478.44,
      usage: 8.77,
      unlimited: false,
      overageAllowed: true,
      maxPurchase: 7143.31,
      nextResetAt: 4884.95,
    },
  },
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `plan`                                                                     | [models.Plan](../models/plan.md)                                           | :heavy_check_mark:                                                         | N/A                                                                        |
| `featureQuantities`                                                        | [models.IncomingFeatureQuantity](../models/incoming-feature-quantity.md)[] | :heavy_check_mark:                                                         | N/A                                                                        |
| `balances`                                                                 | Record<string, [models.IncomingBalances](../models/incoming-balances.md)>  | :heavy_check_mark:                                                         | N/A                                                                        |
| `periodStart`                                                              | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `periodEnd`                                                                | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |