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

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `id`                                                            | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `name`                                                          | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `description`                                                   | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `group`                                                         | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `version`                                                       | *number*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `addOn`                                                         | *boolean*                                                       | :heavy_check_mark:                                              | N/A                                                             |
| `autoEnable`                                                    | *boolean*                                                       | :heavy_check_mark:                                              | N/A                                                             |
| `price`                                                         | [models.PlanPrice](../models/plan-price.md)                     | :heavy_check_mark:                                              | N/A                                                             |
| `items`                                                         | [models.Item](../models/item.md)[]                              | :heavy_check_mark:                                              | N/A                                                             |
| `freeTrial`                                                     | [models.FreeTrial](../models/free-trial.md)                     | :heavy_minus_sign:                                              | N/A                                                             |
| `createdAt`                                                     | *number*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `env`                                                           | [models.PlanEnv](../models/plan-env.md)                         | :heavy_check_mark:                                              | N/A                                                             |
| `archived`                                                      | *boolean*                                                       | :heavy_check_mark:                                              | N/A                                                             |
| `baseVariantId`                                                 | *string*                                                        | :heavy_check_mark:                                              | N/A                                                             |
| `customerEligibility`                                           | [models.CustomerEligibility](../models/customer-eligibility.md) | :heavy_minus_sign:                                              | N/A                                                             |