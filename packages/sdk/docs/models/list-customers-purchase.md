# ListCustomersPurchase

## Example Usage

```typescript
import { ListCustomersPurchase } from "@useautumn/sdk";

let value: ListCustomersPurchase = {
  planId: "<id>",
  expiresAt: 7305.07,
  startedAt: 6817.18,
  quantity: 6300.05,
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