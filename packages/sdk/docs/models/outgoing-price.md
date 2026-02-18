# OutgoingPrice

## Example Usage

```typescript
import { OutgoingPrice } from "@useautumn/sdk";

let value: OutgoingPrice = {
  billingUnits: 4961.88,
  billingMethod: "usage_based",
  maxPurchase: 7757.43,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `amount`                                                             | *number*                                                             | :heavy_minus_sign:                                                   | N/A                                                                  |
| `tiers`                                                              | [models.OutgoingTier](../models/outgoing-tier.md)[]                  | :heavy_minus_sign:                                                   | N/A                                                                  |
| `billingUnits`                                                       | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `billingMethod`                                                      | [models.OutgoingBillingMethod](../models/outgoing-billing-method.md) | :heavy_check_mark:                                                   | N/A                                                                  |
| `maxPurchase`                                                        | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |