# ItemPrice

## Example Usage

```typescript
import { ItemPrice } from "@useautumn/sdk";

let value: ItemPrice = {
  interval: "quarter",
  billingUnits: 1674.79,
  billingMethod: "prepaid",
  maxPurchase: 6381.19,
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `amount`                                                     | *number*                                                     | :heavy_minus_sign:                                           | N/A                                                          |
| `tiers`                                                      | [models.PlanTier](../models/plan-tier.md)[]                  | :heavy_minus_sign:                                           | N/A                                                          |
| `interval`                                                   | [models.PriceItemInterval](../models/price-item-interval.md) | :heavy_check_mark:                                           | N/A                                                          |
| `intervalCount`                                              | *number*                                                     | :heavy_minus_sign:                                           | N/A                                                          |
| `billingUnits`                                               | *number*                                                     | :heavy_check_mark:                                           | N/A                                                          |
| `billingMethod`                                              | [models.PlanBillingMethod](../models/plan-billing-method.md) | :heavy_check_mark:                                           | N/A                                                          |
| `maxPurchase`                                                | *number*                                                     | :heavy_check_mark:                                           | N/A                                                          |