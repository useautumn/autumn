# Breakdown

## Example Usage

```typescript
import { Breakdown } from "@useautumn/sdk";

let value: Breakdown = {
  planId: "<id>",
  includedGrant: 2970.54,
  prepaidGrant: 4188.54,
  remaining: 1280.15,
  usage: 6781.76,
  unlimited: false,
  reset: {
    interval: "week",
    resetsAt: 5720.66,
  },
  price: {
    billingUnits: 9556.8,
    billingMethod: "prepaid",
    maxPurchase: 8750,
  },
  expiresAt: 5815.94,
};
```

## Fields

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `planId`                                            | *string*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `includedGrant`                                     | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `prepaidGrant`                                      | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `remaining`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `usage`                                             | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `unlimited`                                         | *boolean*                                           | :heavy_check_mark:                                  | N/A                                                 |
| `reset`                                             | [models.CustomerReset](../models/customer-reset.md) | :heavy_check_mark:                                  | N/A                                                 |
| `price`                                             | [models.CustomerPrice](../models/customer-price.md) | :heavy_check_mark:                                  | N/A                                                 |
| `expiresAt`                                         | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |