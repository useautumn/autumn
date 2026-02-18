# BalancesTrackResponse

OK

## Example Usage

```typescript
import { BalancesTrackResponse } from "@useautumn/sdk";

let value: BalancesTrackResponse = {
  customerId: "<id>",
  value: 107.2,
  balance: {
    featureId: "<id>",
    granted: 121.68,
    remaining: 7842.83,
    usage: 1803.23,
    unlimited: false,
    overageAllowed: true,
    maxPurchase: 8102.46,
    nextResetAt: 9943.89,
  },
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `customerId`                                                                         | *string*                                                                             | :heavy_check_mark:                                                                   | The ID of the customer                                                               |
| `entityId`                                                                           | *string*                                                                             | :heavy_minus_sign:                                                                   | The ID of the entity (if provided)                                                   |
| `eventName`                                                                          | *string*                                                                             | :heavy_minus_sign:                                                                   | The name of the event                                                                |
| `value`                                                                              | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `balance`                                                                            | [models.BalancesTrackBalance](../models/balances-track-balance.md)                   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `balances`                                                                           | Record<string, [models.BalancesTrackBalances](../models/balances-track-balances.md)> | :heavy_minus_sign:                                                                   | N/A                                                                                  |