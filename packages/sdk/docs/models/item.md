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

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `featureId`                                                                                                                          | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | The ID of the feature this item configures.                                                                                          |
| `feature`                                                                                                                            | [models.PlanFeature](../models/plan-feature.md)                                                                                      | :heavy_minus_sign:                                                                                                                   | The full feature object if expanded.                                                                                                 |
| `included`                                                                                                                           | *number*                                                                                                                             | :heavy_check_mark:                                                                                                                   | Number of free units included. For consumable features, balance resets to this number each interval.                                 |
| `unlimited`                                                                                                                          | *boolean*                                                                                                                            | :heavy_check_mark:                                                                                                                   | Whether the customer has unlimited access to this feature.                                                                           |
| `reset`                                                                                                                              | [models.PlanReset](../models/plan-reset.md)                                                                                          | :heavy_check_mark:                                                                                                                   | Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles. |
| `price`                                                                                                                              | [models.PlanItemPrice](../models/plan-item-price.md)                                                                                 | :heavy_check_mark:                                                                                                                   | Pricing configuration for usage beyond included units. Null if feature is entirely free.                                             |
| `display`                                                                                                                            | [models.PlanItemDisplay](../models/plan-item-display.md)                                                                             | :heavy_minus_sign:                                                                                                                   | Display text for showing this item in pricing pages.                                                                                 |
| `rollover`                                                                                                                           | [models.PlanRollover](../models/plan-rollover.md)                                                                                    | :heavy_minus_sign:                                                                                                                   | Rollover configuration for unused units. If set, unused included units roll over to the next period.                                 |