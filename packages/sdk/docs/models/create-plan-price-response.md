# CreatePlanPriceResponse

## Example Usage

```typescript
import { CreatePlanPriceResponse } from "@useautumn/sdk";

let value: CreatePlanPriceResponse = {
  amount: 9771.73,
  interval: "year",
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `amount`                                                                                   | *number*                                                                                   | :heavy_check_mark:                                                                         | Base price amount for the plan.                                                            |
| `interval`                                                                                 | [models.CreatePlanPriceIntervalResponse](../models/create-plan-price-interval-response.md) | :heavy_check_mark:                                                                         | Billing interval (e.g. 'month', 'year').                                                   |
| `intervalCount`                                                                            | *number*                                                                                   | :heavy_minus_sign:                                                                         | Number of intervals per billing cycle. Defaults to 1.                                      |
| `display`                                                                                  | [models.CreatePlanPriceDisplay](../models/create-plan-price-display.md)                    | :heavy_minus_sign:                                                                         | Display text for showing this price in pricing pages.                                      |