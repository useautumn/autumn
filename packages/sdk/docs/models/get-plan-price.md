# GetPlanPrice

## Example Usage

```typescript
import { GetPlanPrice } from "@useautumn/sdk";

let value: GetPlanPrice = {
  amount: 8428,
  interval: "semi_annual",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `amount`                                                            | *number*                                                            | :heavy_check_mark:                                                  | Base price amount for the plan.                                     |
| `interval`                                                          | [models.GetPlanPriceInterval](../models/get-plan-price-interval.md) | :heavy_check_mark:                                                  | Billing interval (e.g. 'month', 'year').                            |
| `intervalCount`                                                     | *number*                                                            | :heavy_minus_sign:                                                  | Number of intervals per billing cycle. Defaults to 1.               |
| `display`                                                           | [models.GetPlanPriceDisplay](../models/get-plan-price-display.md)   | :heavy_minus_sign:                                                  | Display text for showing this price in pricing pages.               |