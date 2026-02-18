# ListCustomersBreakdown

## Example Usage

```typescript
import { ListCustomersBreakdown } from "@useautumn/sdk";

let value: ListCustomersBreakdown = {
  object: "balance_breakdown",
  planId: "<id>",
  includedGrant: 625.15,
  prepaidGrant: 422.07,
  remaining: 9195.45,
  usage: 8064.71,
  unlimited: true,
  reset: {
    interval: "week",
    resetsAt: 4427.32,
  },
  price: {
    billingUnits: 7234.97,
    billingMethod: "prepaid",
    maxPurchase: 6333.52,
  },
  expiresAt: 9959.62,
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `object`                                                       | *"balance_breakdown"*                                          | :heavy_check_mark:                                             | N/A                                                            |
| `id`                                                           | *string*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `planId`                                                       | *string*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `includedGrant`                                                | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `prepaidGrant`                                                 | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `remaining`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `usage`                                                        | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `unlimited`                                                    | *boolean*                                                      | :heavy_check_mark:                                             | N/A                                                            |
| `reset`                                                        | [models.ListCustomersReset](../models/list-customers-reset.md) | :heavy_check_mark:                                             | N/A                                                            |
| `price`                                                        | [models.ListCustomersPrice](../models/list-customers-price.md) | :heavy_check_mark:                                             | N/A                                                            |
| `expiresAt`                                                    | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |