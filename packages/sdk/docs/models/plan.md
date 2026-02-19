# Plan

## Example Usage

```typescript
import { Plan } from "@useautumn/sdk";

let value: Plan = {
  id: "<id>",
  name: "<value>",
  description:
    "deplore incomparable among because tired diligently pillow tenant pro mmm",
  group: "<value>",
  version: 9790.07,
  addOn: true,
  autoEnable: false,
  price: {
    amount: 3075.99,
    interval: "one_off",
  },
  items: [],
  createdAt: 3920.84,
  env: "live",
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
| `price`                                                                                                                    | [models.PlanPrice](../models/plan-price.md)                                                                                | :heavy_check_mark:                                                                                                         | Base recurring price for the plan. Null for free plans or usage-only plans.                                                |
| `items`                                                                                                                    | [models.Item](../models/item.md)[]                                                                                         | :heavy_check_mark:                                                                                                         | Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature. |
| `freeTrial`                                                                                                                | [models.FreeTrial](../models/free-trial.md)                                                                                | :heavy_minus_sign:                                                                                                         | Free trial configuration. If set, new customers can try this plan before being charged.                                    |
| `createdAt`                                                                                                                | *number*                                                                                                                   | :heavy_check_mark:                                                                                                         | Unix timestamp (ms) when the plan was created.                                                                             |
| `env`                                                                                                                      | [models.PlanEnv](../models/plan-env.md)                                                                                    | :heavy_check_mark:                                                                                                         | Environment this plan belongs to ('sandbox' or 'live').                                                                    |
| `archived`                                                                                                                 | *boolean*                                                                                                                  | :heavy_check_mark:                                                                                                         | Whether the plan is archived. Archived plans cannot be attached to new customers.                                          |
| `baseVariantId`                                                                                                            | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | If this is a variant, the ID of the base plan it was created from.                                                         |