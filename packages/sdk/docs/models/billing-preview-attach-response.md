# BillingPreviewAttachResponse

OK

## Example Usage

```typescript
import { BillingPreviewAttachResponse } from "@useautumn/sdk";

let value: BillingPreviewAttachResponse = {
  customerId: "<id>",
  lineItems: [
    {
      title: "<value>",
      description:
        "what finally apparatus coaxingly atop inside amid heavily CD notwithstanding",
      amount: 8002.47,
      planId: "<id>",
      totalQuantity: 1699.59,
      paidQuantity: 5709.75,
    },
  ],
  total: 3142.76,
  currency: "Surinam Dollar",
  incoming: [
    {
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
    },
  ],
  outgoing: [],
  redirectType: "stripe_checkout",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `customerId`                                                                           | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `lineItems`                                                                            | [models.BillingPreviewAttachLineItem](../models/billing-preview-attach-line-item.md)[] | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `total`                                                                                | *number*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `currency`                                                                             | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `periodStart`                                                                          | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `periodEnd`                                                                            | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `nextCycle`                                                                            | [models.BillingPreviewAttachNextCycle](../models/billing-preview-attach-next-cycle.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `incoming`                                                                             | [models.Incoming](../models/incoming.md)[]                                             | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `outgoing`                                                                             | [models.Outgoing](../models/outgoing.md)[]                                             | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `redirectType`                                                                         | [models.RedirectType](../models/redirect-type.md)                                      | :heavy_check_mark:                                                                     | N/A                                                                                    |