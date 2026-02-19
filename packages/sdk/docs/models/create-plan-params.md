# CreatePlanParams

## Example Usage

```typescript
import { CreatePlanParams } from "@useautumn/sdk";

let value: CreatePlanParams = {
  planId: "free_plan",
  name: "Free",
  autoEnable: true,
  items: [
    {
      featureId: "messages",
      included: 100,
      reset: {
        interval: "month",
      },
    },
  ],
};
```

## Fields

| Field                                                                                                                     | Type                                                                                                                      | Required                                                                                                                  | Description                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `planId`                                                                                                                  | *string*                                                                                                                  | :heavy_check_mark:                                                                                                        | The ID of the plan to create.                                                                                             |
| `group`                                                                                                                   | *string*                                                                                                                  | :heavy_minus_sign:                                                                                                        | Group identifier for organizing related plans. Plans in the same group are mutually exclusive.                            |
| `name`                                                                                                                    | *string*                                                                                                                  | :heavy_check_mark:                                                                                                        | Display name of the plan.                                                                                                 |
| `description`                                                                                                             | *string*                                                                                                                  | :heavy_minus_sign:                                                                                                        | Optional description of the plan.                                                                                         |
| `addOn`                                                                                                                   | *boolean*                                                                                                                 | :heavy_minus_sign:                                                                                                        | If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group. |
| `autoEnable`                                                                                                              | *boolean*                                                                                                                 | :heavy_minus_sign:                                                                                                        | If true, plan is automatically attached when a customer is created. Use for free tiers.                                   |
| `price`                                                                                                                   | [models.CreatePlanPriceRequest](../models/create-plan-price-request.md)                                                   | :heavy_minus_sign:                                                                                                        | Base recurring price for the plan. Omit for free or usage-only plans.                                                     |
| `items`                                                                                                                   | [models.CreatePlanItemRequest](../models/create-plan-item-request.md)[]                                                   | :heavy_minus_sign:                                                                                                        | Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.                      |
| `freeTrial`                                                                                                               | [models.CreatePlanFreeTrialRequest](../models/create-plan-free-trial-request.md)                                          | :heavy_minus_sign:                                                                                                        | Free trial configuration. Customers can try this plan before being charged.                                               |