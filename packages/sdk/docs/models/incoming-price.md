# IncomingPrice

## Example Usage

```typescript
import { IncomingPrice } from "@useautumn/sdk";

let value: IncomingPrice = {
  billingUnits: 4983.46,
  billingMethod: "usage_based",
  maxPurchase: 2767.96,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `amount`                                                             | *number*                                                             | :heavy_minus_sign:                                                   | N/A                                                                  |
| `tiers`                                                              | [models.IncomingTier](../models/incoming-tier.md)[]                  | :heavy_minus_sign:                                                   | N/A                                                                  |
| `billingUnits`                                                       | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `billingMethod`                                                      | [models.IncomingBillingMethod](../models/incoming-billing-method.md) | :heavy_check_mark:                                                   | N/A                                                                  |
| `maxPurchase`                                                        | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |