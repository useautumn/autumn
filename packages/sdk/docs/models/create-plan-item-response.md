# CreatePlanItemResponse

## Example Usage

```typescript
import { CreatePlanItemResponse } from "@useautumn/sdk";

let value: CreatePlanItemResponse = {
  featureId: "<id>",
  included: 5028.41,
  unlimited: false,
  reset: {
    interval: "day",
  },
  price: {
    interval: "one_off",
    billingUnits: 1977.16,
    billingMethod: "prepaid",
    maxPurchase: 1825.29,
  },
};
```

## Fields

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `featureId`                                                                                                                          | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | The ID of the feature this item configures.                                                                                          |
| `feature`                                                                                                                            | [models.CreatePlanFeature](../models/create-plan-feature.md)                                                                         | :heavy_minus_sign:                                                                                                                   | The full feature object if expanded.                                                                                                 |
| `included`                                                                                                                           | *number*                                                                                                                             | :heavy_check_mark:                                                                                                                   | Number of free units included. For consumable features, balance resets to this number each interval.                                 |
| `unlimited`                                                                                                                          | *boolean*                                                                                                                            | :heavy_check_mark:                                                                                                                   | Whether the customer has unlimited access to this feature.                                                                           |
| `reset`                                                                                                                              | [models.CreatePlanResetResponse](../models/create-plan-reset-response.md)                                                            | :heavy_check_mark:                                                                                                                   | Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles. |
| `price`                                                                                                                              | [models.CreatePlanItemPriceResponse](../models/create-plan-item-price-response.md)                                                   | :heavy_check_mark:                                                                                                                   | Pricing configuration for usage beyond included units. Null if feature is entirely free.                                             |
| `display`                                                                                                                            | [models.CreatePlanItemDisplay](../models/create-plan-item-display.md)                                                                | :heavy_minus_sign:                                                                                                                   | Display text for showing this item in pricing pages.                                                                                 |
| `rollover`                                                                                                                           | [models.CreatePlanRolloverResponse](../models/create-plan-rollover-response.md)                                                      | :heavy_minus_sign:                                                                                                                   | Rollover configuration for unused units. If set, unused included units roll over to the next period.                                 |