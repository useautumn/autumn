# UpdatePlanPriceResponse

## Example Usage

```typescript
import { UpdatePlanPriceResponse } from "@useautumn/sdk";

let value: UpdatePlanPriceResponse = {
  amount: 3988.66,
  interval: "week",
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `amount`                                                                                   | *number*                                                                                   | :heavy_check_mark:                                                                         | Base price amount for the plan.                                                            |
| `interval`                                                                                 | [models.UpdatePlanPriceIntervalResponse](../models/update-plan-price-interval-response.md) | :heavy_check_mark:                                                                         | Billing interval (e.g. 'month', 'year').                                                   |
| `intervalCount`                                                                            | *number*                                                                                   | :heavy_minus_sign:                                                                         | Number of intervals per billing cycle. Defaults to 1.                                      |
| `display`                                                                                  | [models.UpdatePlanPriceDisplay](../models/update-plan-price-display.md)                    | :heavy_minus_sign:                                                                         | Display text for showing this price in pricing pages.                                      |