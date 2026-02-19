# UpdatePlanItemRequest

## Example Usage

```typescript
import { UpdatePlanItemRequest } from "@useautumn/sdk";

let value: UpdatePlanItemRequest = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `featureId`                                                                                  | *string*                                                                                     | :heavy_check_mark:                                                                           | The ID of the feature to configure.                                                          |
| `included`                                                                                   | *number*                                                                                     | :heavy_minus_sign:                                                                           | Number of free units included. Balance resets to this each interval for consumable features. |
| `unlimited`                                                                                  | *boolean*                                                                                    | :heavy_minus_sign:                                                                           | If true, customer has unlimited access to this feature.                                      |
| `reset`                                                                                      | [models.UpdatePlanResetRequest](../models/update-plan-reset-request.md)                      | :heavy_minus_sign:                                                                           | Reset configuration for consumable features. Omit for non-consumable features like seats.    |
| `price`                                                                                      | [models.UpdatePlanItemPriceRequest](../models/update-plan-item-price-request.md)             | :heavy_minus_sign:                                                                           | Pricing for usage beyond included units. Omit for free features.                             |
| `proration`                                                                                  | [models.UpdatePlanProration](../models/update-plan-proration.md)                             | :heavy_minus_sign:                                                                           | Proration settings for prepaid features. Controls mid-cycle quantity change billing.         |
| `rollover`                                                                                   | [models.UpdatePlanRolloverRequest](../models/update-plan-rollover-request.md)                | :heavy_minus_sign:                                                                           | Rollover config for unused units. If set, unused included units carry over.                  |