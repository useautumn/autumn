# UpdateCustomerPurchase

## Example Usage

```typescript
import { UpdateCustomerPurchase } from "@useautumn/sdk";

let value: UpdateCustomerPurchase = {
  planId: "<id>",
  expiresAt: 4314.34,
  startedAt: 9755.02,
  quantity: 1307.25,
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