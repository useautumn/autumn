# ListCustomersBalances

## Example Usage

```typescript
import { ListCustomersBalances } from "@useautumn/sdk";

let value: ListCustomersBalances = {
  featureId: "<id>",
  granted: 2638.08,
  remaining: 7638.23,
  usage: 7770.47,
  unlimited: false,
  overageAllowed: false,
  maxPurchase: 1309.81,
  nextResetAt: 1108.02,
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `featureId`                                                              | *string*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `feature`                                                                | [models.ListCustomersFeature](../models/list-customers-feature.md)       | :heavy_minus_sign:                                                       | N/A                                                                      |
| `granted`                                                                | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `remaining`                                                              | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `usage`                                                                  | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `unlimited`                                                              | *boolean*                                                                | :heavy_check_mark:                                                       | N/A                                                                      |
| `overageAllowed`                                                         | *boolean*                                                                | :heavy_check_mark:                                                       | N/A                                                                      |
| `maxPurchase`                                                            | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `nextResetAt`                                                            | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `breakdown`                                                              | [models.ListCustomersBreakdown](../models/list-customers-breakdown.md)[] | :heavy_minus_sign:                                                       | N/A                                                                      |
| `rollovers`                                                              | [models.ListCustomersRollover](../models/list-customers-rollover.md)[]   | :heavy_minus_sign:                                                       | N/A                                                                      |