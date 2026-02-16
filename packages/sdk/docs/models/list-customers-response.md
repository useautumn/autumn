# ListCustomersResponse

OK

## Example Usage

```typescript
import { ListCustomersResponse } from "@useautumn/sdk";

let value: ListCustomersResponse = {
  list: [
    {
      id: "<id>",
      name: "<value>",
      email: "Cole_Kuhn@gmail.com",
      createdAt: 9730.61,
      fingerprint: "<value>",
      stripeId: "<id>",
      env: "live",
      metadata: {
        "key": "<value>",
      },
      sendEmailReceipts: true,
      subscriptions: [],
      purchases: [
        {
          planId: "<id>",
          expiresAt: 4940.05,
          startedAt: 1235.42,
          quantity: 3895.4,
        },
      ],
      balances: {},
    },
  ],
  hasMore: false,
  offset: 2759.18,
  limit: 4916.55,
  total: 957.6,
};
```

## Fields

| Field                                              | Type                                               | Required                                           | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `list`                                             | [models.List](../models/list.md)[]                 | :heavy_check_mark:                                 | Array of items for current page                    |
| `hasMore`                                          | *boolean*                                          | :heavy_check_mark:                                 | Whether more results exist after this page         |
| `offset`                                           | *number*                                           | :heavy_check_mark:                                 | Current offset position                            |
| `limit`                                            | *number*                                           | :heavy_check_mark:                                 | Limit passed in the request                        |
| `total`                                            | *number*                                           | :heavy_check_mark:                                 | Total number of items returned in the current page |