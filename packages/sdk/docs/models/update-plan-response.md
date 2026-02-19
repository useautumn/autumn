# UpdatePlanResponse

A plan defines a set of features, pricing, and entitlements that can be attached to customers.

## Example Usage

```typescript
import { UpdatePlanResponse } from "@useautumn/sdk";

let value: UpdatePlanResponse = {
  id: "pro",
  name: "Pro Plan",
  description: null,
  group: null,
  version: 1,
  addOn: false,
  autoEnable: false,
  price: {
    amount: 10,
    interval: "month",
    display: {
      primaryText: "<value>",
    },
  },
  items: [
    {
      featureId: "<id>",
      included: 100,
      unlimited: false,
      reset: {
        interval: "month",
      },
      price: {
        amount: 0.5,
        interval: "month",
        billingUnits: 1463.81,
        billingMethod: "prepaid",
        maxPurchase: 4443.11,
      },
      display: {
        primaryText: "<value>",
      },
    },
    {
      featureId: "<id>",
      included: 0,
      unlimited: false,
      reset: null,
      price: {
        amount: 10,
        interval: "month",
        billingUnits: 5850.56,
        billingMethod: "prepaid",
        maxPurchase: 8502.08,
      },
      display: {
        primaryText: "<value>",
      },
    },
  ],
  createdAt: 4378.26,
  env: "sandbox",
  archived: false,
  baseVariantId: "<id>",
};
```

## Fields

| Field                                                                                                                      | Type                                                                                                                       | Required                                                                                                                   | Description                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                       | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | Unique identifier for the plan.                                                                                            |
| `name`                                                                                                                     | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | Display name of the plan.                                                                                                  |
| `description`                                                                                                              | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | Optional description of the plan.                                                                                          |
| `group`                                                                                                                    | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | Group identifier for organizing related plans. Plans in the same group are mutually exclusive.                             |
| `version`                                                                                                                  | *number*                                                                                                                   | :heavy_check_mark:                                                                                                         | Version number of the plan. Incremented when plan configuration changes.                                                   |
| `addOn`                                                                                                                    | *boolean*                                                                                                                  | :heavy_check_mark:                                                                                                         | Whether this is an add-on plan that can be attached alongside a main plan.                                                 |
| `autoEnable`                                                                                                               | *boolean*                                                                                                                  | :heavy_check_mark:                                                                                                         | If true, this plan is automatically attached when a customer is created. Used for free plans.                              |
| `price`                                                                                                                    | [models.UpdatePlanPriceResponse](../models/update-plan-price-response.md)                                                  | :heavy_check_mark:                                                                                                         | Base recurring price for the plan. Null for free plans or usage-only plans.                                                |
| `items`                                                                                                                    | [models.UpdatePlanItemResponse](../models/update-plan-item-response.md)[]                                                  | :heavy_check_mark:                                                                                                         | Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature. |
| `freeTrial`                                                                                                                | [models.UpdatePlanFreeTrialResponse](../models/update-plan-free-trial-response.md)                                         | :heavy_minus_sign:                                                                                                         | Free trial configuration. If set, new customers can try this plan before being charged.                                    |
| `createdAt`                                                                                                                | *number*                                                                                                                   | :heavy_check_mark:                                                                                                         | Unix timestamp (ms) when the plan was created.                                                                             |
| `env`                                                                                                                      | [models.UpdatePlanEnv](../models/update-plan-env.md)                                                                       | :heavy_check_mark:                                                                                                         | Environment this plan belongs to ('sandbox' or 'live').                                                                    |
| `archived`                                                                                                                 | *boolean*                                                                                                                  | :heavy_check_mark:                                                                                                         | Whether the plan is archived. Archived plans cannot be attached to new customers.                                          |
| `baseVariantId`                                                                                                            | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | If this is a variant, the ID of the base plan it was created from.                                                         |