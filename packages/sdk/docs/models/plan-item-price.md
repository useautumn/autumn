# PlanItemPrice

## Example Usage

```typescript
import { PlanItemPrice } from "@useautumn/sdk";

let value: PlanItemPrice = {
  interval: "month",
  billingUnits: 1850.03,
  billingMethod: "prepaid",
  maxPurchase: 2110.38,
};
```

## Fields

| Field                                                                 | Type                                                                  | Required                                                              | Description                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `amount`                                                              | *number*                                                              | :heavy_minus_sign:                                                    | N/A                                                                   |
| `tiers`                                                               | [models.PlanTier](../models/plan-tier.md)[]                           | :heavy_minus_sign:                                                    | N/A                                                                   |
| `interval`                                                            | [models.PlanPriceItemInterval](../models/plan-price-item-interval.md) | :heavy_check_mark:                                                    | N/A                                                                   |
| `intervalCount`                                                       | *number*                                                              | :heavy_minus_sign:                                                    | N/A                                                                   |
| `billingUnits`                                                        | *number*                                                              | :heavy_check_mark:                                                    | N/A                                                                   |
| `billingMethod`                                                       | [models.PlanBillingMethod](../models/plan-billing-method.md)          | :heavy_check_mark:                                                    | N/A                                                                   |
| `maxPurchase`                                                         | *number*                                                              | :heavy_check_mark:                                                    | N/A                                                                   |