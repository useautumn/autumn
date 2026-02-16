# Item

## Example Usage

```typescript
import { Item } from "@useautumn/sdk";

let value: Item = {
  featureId: "<id>",
  included: 4249.12,
  unlimited: false,
  reset: {
    interval: "year",
  },
  price: {
    interval: "one_off",
    billingUnits: 5268.83,
    billingMethod: "usage_based",
    maxPurchase: 9846.03,
  },
};
```

## Fields

| Field                                             | Type                                              | Required                                          | Description                                       |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `featureId`                                       | *string*                                          | :heavy_check_mark:                                | N/A                                               |
| `included`                                        | *number*                                          | :heavy_check_mark:                                | N/A                                               |
| `unlimited`                                       | *boolean*                                         | :heavy_check_mark:                                | N/A                                               |
| `reset`                                           | [models.PlanReset](../models/plan-reset.md)       | :heavy_check_mark:                                | N/A                                               |
| `price`                                           | [models.ItemPrice](../models/item-price.md)       | :heavy_check_mark:                                | N/A                                               |
| `rollover`                                        | [models.PlanRollover](../models/plan-rollover.md) | :heavy_minus_sign:                                | N/A                                               |
| `proration`                                       | [models.Proration](../models/proration.md)        | :heavy_minus_sign:                                | N/A                                               |