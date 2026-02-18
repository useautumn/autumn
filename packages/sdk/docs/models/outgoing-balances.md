# OutgoingBalances

## Example Usage

```typescript
import { OutgoingBalances } from "@useautumn/sdk";

let value: OutgoingBalances = {
  featureId: "<id>",
  granted: 4580.63,
  remaining: 1565.6,
  usage: 5821.19,
  unlimited: true,
  overageAllowed: false,
  maxPurchase: 1790.68,
  nextResetAt: 2790.71,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `featureId`                                                   | *string*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `feature`                                                     | [models.OutgoingFeature](../models/outgoing-feature.md)       | :heavy_minus_sign:                                            | N/A                                                           |
| `granted`                                                     | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `remaining`                                                   | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `usage`                                                       | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `unlimited`                                                   | *boolean*                                                     | :heavy_check_mark:                                            | N/A                                                           |
| `overageAllowed`                                              | *boolean*                                                     | :heavy_check_mark:                                            | N/A                                                           |
| `maxPurchase`                                                 | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `nextResetAt`                                                 | *number*                                                      | :heavy_check_mark:                                            | N/A                                                           |
| `breakdown`                                                   | [models.OutgoingBreakdown](../models/outgoing-breakdown.md)[] | :heavy_minus_sign:                                            | N/A                                                           |
| `rollovers`                                                   | [models.OutgoingRollover](../models/outgoing-rollover.md)[]   | :heavy_minus_sign:                                            | N/A                                                           |