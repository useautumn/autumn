# UpdatePlanPriceRequest

## Example Usage

```typescript
import { UpdatePlanPriceRequest } from "@useautumn/sdk";

let value: UpdatePlanPriceRequest = {
  amount: 412.83,
  interval: "one_off",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `amount`                                                                                 | *number*                                                                                 | :heavy_check_mark:                                                                       | Base price amount for the plan.                                                          |
| `interval`                                                                               | [models.UpdatePlanPriceIntervalRequest](../models/update-plan-price-interval-request.md) | :heavy_check_mark:                                                                       | Billing interval (e.g. 'month', 'year').                                                 |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of intervals per billing cycle. Defaults to 1.                                    |