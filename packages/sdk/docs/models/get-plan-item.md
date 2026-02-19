# GetPlanItem

## Example Usage

```typescript
import { GetPlanItem } from "@useautumn/sdk";

let value: GetPlanItem = {
  featureId: "<id>",
  included: 7379.05,
  unlimited: true,
  reset: null,
  price: {
    interval: "week",
    billingUnits: 9438.14,
    billingMethod: "prepaid",
    maxPurchase: 4224.48,
  },
};
```

## Fields

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `featureId`                                                                                                                          | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | The ID of the feature this item configures.                                                                                          |
| `feature`                                                                                                                            | [models.GetPlanFeature](../models/get-plan-feature.md)                                                                               | :heavy_minus_sign:                                                                                                                   | The full feature object if expanded.                                                                                                 |
| `included`                                                                                                                           | *number*                                                                                                                             | :heavy_check_mark:                                                                                                                   | Number of free units included. For consumable features, balance resets to this number each interval.                                 |
| `unlimited`                                                                                                                          | *boolean*                                                                                                                            | :heavy_check_mark:                                                                                                                   | Whether the customer has unlimited access to this feature.                                                                           |
| `reset`                                                                                                                              | [models.GetPlanReset](../models/get-plan-reset.md)                                                                                   | :heavy_check_mark:                                                                                                                   | Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles. |
| `price`                                                                                                                              | [models.GetPlanItemPrice](../models/get-plan-item-price.md)                                                                          | :heavy_check_mark:                                                                                                                   | Pricing configuration for usage beyond included units. Null if feature is entirely free.                                             |
| `display`                                                                                                                            | [models.GetPlanItemDisplay](../models/get-plan-item-display.md)                                                                      | :heavy_minus_sign:                                                                                                                   | Display text for showing this item in pricing pages.                                                                                 |
| `rollover`                                                                                                                           | [models.GetPlanRollover](../models/get-plan-rollover.md)                                                                             | :heavy_minus_sign:                                                                                                                   | Rollover configuration for unused units. If set, unused included units roll over to the next period.                                 |