# UpdateCustomerBreakdown

## Example Usage

```typescript
import { UpdateCustomerBreakdown } from "@useautumn/sdk";

let value: UpdateCustomerBreakdown = {
  planId: "<id>",
  includedGrant: 2437.9,
  prepaidGrant: 2339.29,
  remaining: 5463.4,
  usage: 6921.41,
  unlimited: false,
  reset: {
    interval: "year",
    resetsAt: 3469.62,
  },
  price: {
    billingUnits: 1078.41,
    billingMethod: "prepaid",
    maxPurchase: 9999.99,
  },
  expiresAt: 9940.8,
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                                                             | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `planId`                                                         | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `includedGrant`                                                  | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `prepaidGrant`                                                   | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `remaining`                                                      | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `usage`                                                          | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `unlimited`                                                      | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |
| `reset`                                                          | [models.UpdateCustomerReset](../models/update-customer-reset.md) | :heavy_check_mark:                                               | N/A                                                              |
| `price`                                                          | [models.UpdateCustomerPrice](../models/update-customer-price.md) | :heavy_check_mark:                                               | N/A                                                              |
| `expiresAt`                                                      | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |