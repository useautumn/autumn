# Balances

## Example Usage

```typescript
import { Balances } from "@useautumn/sdk";

let value: Balances = {
  object: "balance",
  featureId: "<id>",
  granted: 3195.9,
  remaining: 3289.89,
  usage: 4599.27,
  unlimited: false,
  overageAllowed: false,
  maxPurchase: 1182.05,
  nextResetAt: 5644.6,
};
```

## Fields

| Field                                                       | Type                                                        | Required                                                    | Description                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `object`                                                    | *"balance"*                                                 | :heavy_check_mark:                                          | N/A                                                         |
| `featureId`                                                 | *string*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `feature`                                                   | [models.CustomerFeature](../models/customer-feature.md)     | :heavy_minus_sign:                                          | N/A                                                         |
| `granted`                                                   | *number*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `remaining`                                                 | *number*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `usage`                                                     | *number*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `unlimited`                                                 | *boolean*                                                   | :heavy_check_mark:                                          | N/A                                                         |
| `overageAllowed`                                            | *boolean*                                                   | :heavy_check_mark:                                          | N/A                                                         |
| `maxPurchase`                                               | *number*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `nextResetAt`                                               | *number*                                                    | :heavy_check_mark:                                          | N/A                                                         |
| `breakdown`                                                 | [models.Breakdown](../models/breakdown.md)[]                | :heavy_minus_sign:                                          | N/A                                                         |
| `rollovers`                                                 | [models.CustomerRollover](../models/customer-rollover.md)[] | :heavy_minus_sign:                                          | N/A                                                         |