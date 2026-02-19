# ListPlansItem

## Example Usage

```typescript
import { ListPlansItem } from "@useautumn/sdk";

let value: ListPlansItem = {
  featureId: "<id>",
  included: 4278.62,
  unlimited: true,
  reset: {
    interval: "quarter",
  },
  price: {
    interval: "semi_annual",
    billingUnits: 7496.01,
    billingMethod: "prepaid",
    maxPurchase: 2313.05,
  },
};
```

## Fields

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `featureId`                                                                                                                          | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | The ID of the feature this item configures.                                                                                          |
| `feature`                                                                                                                            | [models.ListPlansFeature](../models/list-plans-feature.md)                                                                           | :heavy_minus_sign:                                                                                                                   | The full feature object if expanded.                                                                                                 |
| `included`                                                                                                                           | *number*                                                                                                                             | :heavy_check_mark:                                                                                                                   | Number of free units included. For consumable features, balance resets to this number each interval.                                 |
| `unlimited`                                                                                                                          | *boolean*                                                                                                                            | :heavy_check_mark:                                                                                                                   | Whether the customer has unlimited access to this feature.                                                                           |
| `reset`                                                                                                                              | [models.ListPlansReset](../models/list-plans-reset.md)                                                                               | :heavy_check_mark:                                                                                                                   | Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles. |
| `price`                                                                                                                              | [models.ListPlansItemPrice](../models/list-plans-item-price.md)                                                                      | :heavy_check_mark:                                                                                                                   | Pricing configuration for usage beyond included units. Null if feature is entirely free.                                             |
| `display`                                                                                                                            | [models.ListPlansItemDisplay](../models/list-plans-item-display.md)                                                                  | :heavy_minus_sign:                                                                                                                   | Display text for showing this item in pricing pages.                                                                                 |
| `rollover`                                                                                                                           | [models.ListPlansRollover](../models/list-plans-rollover.md)                                                                         | :heavy_minus_sign:                                                                                                                   | Rollover configuration for unused units. If set, unused included units roll over to the next period.                                 |