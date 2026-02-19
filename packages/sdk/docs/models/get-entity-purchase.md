# GetEntityPurchase

## Example Usage

```typescript
import { GetEntityPurchase } from "@useautumn/sdk";

let value: GetEntityPurchase = {
  planId: "<id>",
  expiresAt: 7077.77,
  startedAt: 2644.6,
  quantity: 4562.19,
};
```

## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `plan`                                                            | [models.Plan](../models/plan.md)                                  | :heavy_minus_sign:                                                | N/A                                                               |
| `planId`                                                          | *string*                                                          | :heavy_check_mark:                                                | The unique identifier of the purchased plan.                      |
| `expiresAt`                                                       | *number*                                                          | :heavy_check_mark:                                                | Timestamp when the purchase expires, or null for lifetime access. |
| `startedAt`                                                       | *number*                                                          | :heavy_check_mark:                                                | Timestamp when the purchase was made.                             |
| `quantity`                                                        | *number*                                                          | :heavy_check_mark:                                                | Number of units purchased.                                        |