# IncomingBreakdown

## Example Usage

```typescript
import { IncomingBreakdown } from "@useautumn/sdk";

let value: IncomingBreakdown = {
  object: "balance_breakdown",
  planId: "<id>",
  includedGrant: 7793.91,
  prepaidGrant: 8395.06,
  remaining: 153.32,
  usage: 4960.79,
  unlimited: true,
  reset: {
    interval: "day",
    resetsAt: null,
  },
  price: {
    billingUnits: 8324.03,
    billingMethod: "prepaid",
    maxPurchase: 6111.08,
  },
  expiresAt: null,
};
```

## Fields

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `object`                                            | *"balance_breakdown"*                               | :heavy_check_mark:                                  | N/A                                                 |
| `id`                                                | *string*                                            | :heavy_minus_sign:                                  | N/A                                                 |
| `planId`                                            | *string*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `includedGrant`                                     | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `prepaidGrant`                                      | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `remaining`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `usage`                                             | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `unlimited`                                         | *boolean*                                           | :heavy_check_mark:                                  | N/A                                                 |
| `reset`                                             | [models.IncomingReset](../models/incoming-reset.md) | :heavy_check_mark:                                  | N/A                                                 |
| `price`                                             | [models.IncomingPrice](../models/incoming-price.md) | :heavy_check_mark:                                  | N/A                                                 |
| `expiresAt`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |