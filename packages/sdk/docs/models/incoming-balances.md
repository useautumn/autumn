# IncomingBalances

## Example Usage

```typescript
import { IncomingBalances } from "@useautumn/sdk";

let value: IncomingBalances = {
  featureId: "<id>",
  granted: 3885.87,
  remaining: 4866.24,
  usage: 4030.05,
  unlimited: true,
  overageAllowed: true,
  maxPurchase: 8567.35,
  nextResetAt: 5972.57,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `featureId`                                                   | *string*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `feature`                                                     | [models.IncomingFeature](../models/incoming-feature.md)       | :heavy_minus_sign:                                            | N/A                                                           |
| `granted`                                                     | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `remaining`                                                   | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `usage`                                                       | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `unlimited`                                                   | *boolean*                                                     | :heavy_check_mark:                                            | N/A                                                           |
| `overageAllowed`                                              | *boolean*                                                     | :heavy_check_mark:                                            | N/A                                                           |
| `maxPurchase`                                                 | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `nextResetAt`                                                 | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `breakdown`                                                   | [models.IncomingBreakdown](../models/incoming-breakdown.md)[] | :heavy_minus_sign:                                            | N/A                                                           |
| `rollovers`                                                   | [models.IncomingRollover](../models/incoming-rollover.md)[]   | :heavy_minus_sign:                                            | N/A                                                           |