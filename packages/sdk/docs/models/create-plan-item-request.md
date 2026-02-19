# CreatePlanItemRequest

## Example Usage

```typescript
import { CreatePlanItemRequest } from "@useautumn/sdk";

let value: CreatePlanItemRequest = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `featureId`                                                                                  | *string*                                                                                     | :heavy_check_mark:                                                                           | The ID of the feature to configure.                                                          |
| `included`                                                                                   | *number*                                                                                     | :heavy_minus_sign:                                                                           | Number of free units included. Balance resets to this each interval for consumable features. |
| `unlimited`                                                                                  | *boolean*                                                                                    | :heavy_minus_sign:                                                                           | If true, customer has unlimited access to this feature.                                      |
| `reset`                                                                                      | [models.CreatePlanResetRequest](../models/create-plan-reset-request.md)                      | :heavy_minus_sign:                                                                           | Reset configuration for consumable features. Omit for non-consumable features like seats.    |
| `price`                                                                                      | [models.CreatePlanItemPriceRequest](../models/create-plan-item-price-request.md)             | :heavy_minus_sign:                                                                           | Pricing for usage beyond included units. Omit for free features.                             |
| `proration`                                                                                  | [models.CreatePlanProration](../models/create-plan-proration.md)                             | :heavy_minus_sign:                                                                           | Proration settings for prepaid features. Controls mid-cycle quantity change billing.         |
| `rollover`                                                                                   | [models.CreatePlanRolloverRequest](../models/create-plan-rollover-request.md)                | :heavy_minus_sign:                                                                           | Rollover config for unused units. If set, unused included units carry over.                  |