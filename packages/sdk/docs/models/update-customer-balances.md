# UpdateCustomerBalances

## Example Usage

```typescript
import { UpdateCustomerBalances } from "@useautumn/sdk";

let value: UpdateCustomerBalances = {
  object: "balance",
  featureId: "<id>",
  granted: 3659.37,
  remaining: 1762.52,
  usage: 5915.11,
  unlimited: false,
  overageAllowed: false,
  maxPurchase: 8309.89,
  nextResetAt: 3915.29,
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `object`                                                                   | *"balance"*                                                                | :heavy_check_mark:                                                         | N/A                                                                        |
| `featureId`                                                                | *string*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `feature`                                                                  | [models.UpdateCustomerFeature](../models/update-customer-feature.md)       | :heavy_minus_sign:                                                         | N/A                                                                        |
| `granted`                                                                  | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `remaining`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `usage`                                                                    | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `unlimited`                                                                | *boolean*                                                                  | :heavy_check_mark:                                                         | N/A                                                                        |
| `overageAllowed`                                                           | *boolean*                                                                  | :heavy_check_mark:                                                         | N/A                                                                        |
| `maxPurchase`                                                              | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `nextResetAt`                                                              | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `breakdown`                                                                | [models.UpdateCustomerBreakdown](../models/update-customer-breakdown.md)[] | :heavy_minus_sign:                                                         | N/A                                                                        |
| `rollovers`                                                                | [models.UpdateCustomerRollover](../models/update-customer-rollover.md)[]   | :heavy_minus_sign:                                                         | N/A                                                                        |