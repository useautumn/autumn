# UpdatePlanItemResponse

## Example Usage

```typescript
import { UpdatePlanItemResponse } from "@useautumn/sdk";

let value: UpdatePlanItemResponse = {
  featureId: "<id>",
  included: 7325.52,
  unlimited: true,
  reset: {
    interval: "year",
  },
  price: null,
};
```

## Fields

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `featureId`                                                                                                                          | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | The ID of the feature this item configures.                                                                                          |
| `feature`                                                                                                                            | [models.UpdatePlanFeature](../models/update-plan-feature.md)                                                                         | :heavy_minus_sign:                                                                                                                   | The full feature object if expanded.                                                                                                 |
| `included`                                                                                                                           | *number*                                                                                                                             | :heavy_check_mark:                                                                                                                   | Number of free units included. For consumable features, balance resets to this number each interval.                                 |
| `unlimited`                                                                                                                          | *boolean*                                                                                                                            | :heavy_check_mark:                                                                                                                   | Whether the customer has unlimited access to this feature.                                                                           |
| `reset`                                                                                                                              | [models.UpdatePlanResetResponse](../models/update-plan-reset-response.md)                                                            | :heavy_check_mark:                                                                                                                   | Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles. |
| `price`                                                                                                                              | [models.UpdatePlanItemPriceResponse](../models/update-plan-item-price-response.md)                                                   | :heavy_check_mark:                                                                                                                   | Pricing configuration for usage beyond included units. Null if feature is entirely free.                                             |
| `display`                                                                                                                            | [models.UpdatePlanItemDisplay](../models/update-plan-item-display.md)                                                                | :heavy_minus_sign:                                                                                                                   | Display text for showing this item in pricing pages.                                                                                 |
| `rollover`                                                                                                                           | [models.UpdatePlanRolloverResponse](../models/update-plan-rollover-response.md)                                                      | :heavy_minus_sign:                                                                                                                   | Rollover configuration for unused units. If set, unused included units roll over to the next period.                                 |