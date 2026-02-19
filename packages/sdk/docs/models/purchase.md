# Purchase

## Example Usage

```typescript
import { Purchase } from "@useautumn/sdk";

let value: Purchase = {
  planId: "<id>",
  expiresAt: 496.4,
  startedAt: 3445.24,
  quantity: 4242.65,
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