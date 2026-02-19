# CreatePlanPriceRequest

Base recurring price for the plan. Omit for free or usage-only plans.

## Example Usage

```typescript
import { CreatePlanPriceRequest } from "@useautumn/sdk";

let value: CreatePlanPriceRequest = {
  amount: 6009.59,
  interval: "semi_annual",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_check_mark:                                                                       | Base price amount for the plan.                                                          |
| `interval`                                                                               | [models.CreatePlanPriceIntervalRequest](../models/create-plan-price-interval-request.md) | :heavy_check_mark:                                                                       | Billing interval (e.g. 'month', 'year').                                                 |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of intervals per billing cycle. Defaults to 1.                                    |