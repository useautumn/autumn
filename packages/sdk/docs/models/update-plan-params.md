# UpdatePlanParams

## Example Usage

```typescript
import { UpdatePlanParams } from "@useautumn/sdk";

let value: UpdatePlanParams = {
  planId: "pro_plan",
  name: "Pro Plan (Updated)",
  price: {
    amount: 15,
    interval: "month",
  },
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `planId`                                                                                             | *string*                                                                                             | :heavy_check_mark:                                                                                   | The ID of the plan to update.                                                                        |
| `group`                                                                                              | *string*                                                                                             | :heavy_minus_sign:                                                                                   | Group identifier for organizing related plans. Plans in the same group are mutually exclusive.       |
| `name`                                                                                               | *string*                                                                                             | :heavy_minus_sign:                                                                                   | Display name of the plan.                                                                            |
| `description`                                                                                        | *string*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `addOn`                                                                                              | *boolean*                                                                                            | :heavy_minus_sign:                                                                                   | Whether the plan is an add-on.                                                                       |
| `autoEnable`                                                                                         | *boolean*                                                                                            | :heavy_minus_sign:                                                                                   | Whether the plan is automatically enabled.                                                           |
| `price`                                                                                              | [models.UpdatePlanPriceRequest](../models/update-plan-price-request.md)                              | :heavy_minus_sign:                                                                                   | The price of the plan. Set to null to remove the base price.                                         |
| `items`                                                                                              | [models.UpdatePlanItemRequest](../models/update-plan-item-request.md)[]                              | :heavy_minus_sign:                                                                                   | Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. |
| `freeTrial`                                                                                          | [models.UpdatePlanFreeTrialRequest](../models/update-plan-free-trial-request.md)                     | :heavy_minus_sign:                                                                                   | The free trial of the plan. Set to null to remove the free trial.                                    |
| `version`                                                                                            | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `archived`                                                                                           | *boolean*                                                                                            | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `newPlanId`                                                                                          | *string*                                                                                             | :heavy_minus_sign:                                                                                   | The new ID to use for the plan. Can only be updated if the plan has not been used by any customers.  |