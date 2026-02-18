# OutgoingBreakdown

## Example Usage

```typescript
import { OutgoingBreakdown } from "@useautumn/sdk";

let value: OutgoingBreakdown = {
  planId: "<id>",
  includedGrant: 1099.43,
  prepaidGrant: 2387.81,
  remaining: 558.65,
  usage: 9479.41,
  unlimited: true,
  reset: {
    interval: "month",
    resetsAt: 1396.76,
  },
  price: {
    billingUnits: 2793.79,
    billingMethod: "prepaid",
    maxPurchase: 2550.73,
  },
  expiresAt: 7533.43,
};
```

## Fields

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `id`                                                | *string*                                            | :heavy_minus_sign:                                  | N/A                                                 |
| `planId`                                            | *string*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `includedGrant`                                     | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `prepaidGrant`                                      | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `remaining`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `usage`                                             | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `unlimited`                                         | *boolean*                                           | :heavy_check_mark:                                  | N/A                                                 |
| `reset`                                             | [models.OutgoingReset](../models/outgoing-reset.md) | :heavy_check_mark:                                  | N/A                                                 |
| `price`                                             | [models.OutgoingPrice](../models/outgoing-price.md) | :heavy_check_mark:                                  | N/A                                                 |
| `expiresAt`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |