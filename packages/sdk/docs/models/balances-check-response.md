# BalancesCheckResponse

OK

## Example Usage

```typescript
import { BalancesCheckResponse } from "@useautumn/sdk";

let value: BalancesCheckResponse = {
  allowed: true,
  customerId: "<id>",
  balance: {
    object: "balance",
    featureId: "<id>",
    granted: 5669.36,
    remaining: 9220.56,
    usage: 9946.92,
    unlimited: true,
    overageAllowed: false,
    maxPurchase: 4196.97,
    nextResetAt: 7938.17,
  },
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `allowed`                                                          | *boolean*                                                          | :heavy_check_mark:                                                 | N/A                                                                |
| `customerId`                                                       | *string*                                                           | :heavy_check_mark:                                                 | N/A                                                                |
| `entityId`                                                         | *string*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `requiredBalance`                                                  | *number*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `balance`                                                          | [models.BalancesCheckBalance](../models/balances-check-balance.md) | :heavy_check_mark:                                                 | N/A                                                                |
| `preview`                                                          | [models.Preview](../models/preview.md)                             | :heavy_minus_sign:                                                 | N/A                                                                |