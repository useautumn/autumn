# Outgoing

## Example Usage

```typescript
import { Outgoing } from "@useautumn/sdk";

let value: Outgoing = {
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
  featureQuantities: [],
  balances: {
    "key": {
      object: "balance",
      featureId: "<id>",
      granted: 2003.63,
      remaining: 7112.33,
      usage: 4095.87,
      unlimited: true,
      overageAllowed: false,
      maxPurchase: 6543.16,
      nextResetAt: 8324.63,
    },
  },
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `plan`                                                                     | [models.Plan](../models/plan.md)                                           | :heavy_check_mark:                                                         | N/A                                                                        |
| `featureQuantities`                                                        | [models.OutgoingFeatureQuantity](../models/outgoing-feature-quantity.md)[] | :heavy_check_mark:                                                         | N/A                                                                        |
| `balances`                                                                 | Record<string, [models.OutgoingBalances](../models/outgoing-balances.md)>  | :heavy_check_mark:                                                         | N/A                                                                        |
| `periodStart`                                                              | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `periodEnd`                                                                | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |