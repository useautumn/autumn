# CreateEntityPurchase

## Example Usage

```typescript
import { CreateEntityPurchase } from "@useautumn/sdk";

let value: CreateEntityPurchase = {
  planId: "<id>",
  expiresAt: 4006.24,
  startedAt: 8884.43,
  quantity: 6176.82,
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