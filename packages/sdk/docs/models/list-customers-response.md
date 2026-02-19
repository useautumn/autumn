# ListCustomersResponse

OK

## Example Usage

```typescript
import { ListCustomersResponse } from "@useautumn/sdk";

let value: ListCustomersResponse = {
  list: [
    {
      id: "2ee25a41-0d81-4ad2-8451-ec1aadaefe58",
      name: "Patrick",
      email: "patrick@useautumn.com",
      createdAt: 5879.38,
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
          pastDue: true,
          canceledAt: 8709.2,
          expiresAt: 9166.43,
          trialEndsAt: null,
          startedAt: 6729.25,
          currentPeriodStart: 7132.91,
          currentPeriodEnd: 9794.16,
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
          maxPurchase: 8784.38,
          nextResetAt: 5793.24,
          breakdown: [
            {
              id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
              planId: "<id>",
              includedGrant: 3304.66,
              prepaidGrant: 136.52,
              remaining: 0,
              usage: 100,
              unlimited: false,
              reset: {
                interval: "month",
                resetsAt: 6046.98,
              },
              price: null,
              expiresAt: null,
            },
          ],
        },
      },
    },
  ],
  hasMore: false,
  offset: 0,
  limit: 10,
  total: 1,
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `list`                                                         | [models.ListCustomersList](../models/list-customers-list.md)[] | :heavy_check_mark:                                             | Array of items for current page                                |
| `hasMore`                                                      | *boolean*                                                      | :heavy_check_mark:                                             | Whether more results exist after this page                     |
| `offset`                                                       | *number*                                                       | :heavy_check_mark:                                             | Current offset position                                        |
| `limit`                                                        | *number*                                                       | :heavy_check_mark:                                             | Limit passed in the request                                    |
| `total`                                                        | *number*                                                       | :heavy_check_mark:                                             | Total number of items returned in the current page             |