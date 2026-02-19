# ListPlansList

A plan defines a set of features, pricing, and entitlements that can be attached to customers.

## Example Usage

```typescript
import { ListPlansList } from "@useautumn/sdk";

let value: ListPlansList = {
  id: "<id>",
  name: "<value>",
  description:
    "following zesty mainstream old-fashioned phooey grandiose misspend until um except",
  group: "<value>",
  version: 5269.38,
  addOn: false,
  autoEnable: true,
  price: {
    amount: 6067.23,
    interval: "quarter",
  },
  items: [
    {
      featureId: "<id>",
      included: 4783.11,
      unlimited: false,
      reset: {
        interval: "quarter",
      },
      price: {
        interval: "semi_annual",
        billingUnits: 7496.01,
        billingMethod: "prepaid",
        maxPurchase: 2313.05,
      },
    },
  ],
  createdAt: 3560.6,
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
| `price`                                                                                                                    | [models.ListPlansPrice](../models/list-plans-price.md)                                                                     | :heavy_check_mark:                                                                                                         | Base recurring price for the plan. Null for free plans or usage-only plans.                                                |
| `items`                                                                                                                    | [models.ListPlansItem](../models/list-plans-item.md)[]                                                                     | :heavy_check_mark:                                                                                                         | Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature. |
| `freeTrial`                                                                                                                | [models.ListPlansFreeTrial](../models/list-plans-free-trial.md)                                                            | :heavy_minus_sign:                                                                                                         | Free trial configuration. If set, new customers can try this plan before being charged.                                    |
| `createdAt`                                                                                                                | *number*                                                                                                                   | :heavy_check_mark:                                                                                                         | Unix timestamp (ms) when the plan was created.                                                                             |
| `env`                                                                                                                      | [models.ListPlansEnv](../models/list-plans-env.md)                                                                         | :heavy_check_mark:                                                                                                         | Environment this plan belongs to ('sandbox' or 'live').                                                                    |
| `archived`                                                                                                                 | *boolean*                                                                                                                  | :heavy_check_mark:                                                                                                         | Whether the plan is archived. Archived plans cannot be attached to new customers.                                          |
| `baseVariantId`                                                                                                            | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | If this is a variant, the ID of the base plan it was created from.                                                         |