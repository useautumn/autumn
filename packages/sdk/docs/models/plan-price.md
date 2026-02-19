# PlanPrice

## Example Usage

```typescript
import { PlanPrice } from "@useautumn/sdk";

let value: PlanPrice = {
  amount: 8342.91,
  interval: "year",
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `amount`                                                     | *number*                                                     | :heavy_check_mark:                                           | Base price amount for the plan.                              |
| `interval`                                                   | [models.PlanPriceInterval](../models/plan-price-interval.md) | :heavy_check_mark:                                           | Billing interval (e.g. 'month', 'year').                     |
| `intervalCount`                                              | *number*                                                     | :heavy_minus_sign:                                           | Number of intervals per billing cycle. Defaults to 1.        |
| `display`                                                    | [models.PlanPriceDisplay](../models/plan-price-display.md)   | :heavy_minus_sign:                                           | Display text for showing this price in pricing pages.        |