# ListPlansPrice

## Example Usage

```typescript
import { ListPlansPrice } from "@useautumn/sdk";

let value: ListPlansPrice = {
  amount: 2279.84,
  interval: "year",
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `amount`                                                                | *number*                                                                | :heavy_check_mark:                                                      | Base price amount for the plan.                                         |
| `interval`                                                              | [models.ListPlansPriceInterval](../models/list-plans-price-interval.md) | :heavy_check_mark:                                                      | Billing interval (e.g. 'month', 'year').                                |
| `intervalCount`                                                         | *number*                                                                | :heavy_minus_sign:                                                      | Number of intervals per billing cycle. Defaults to 1.                   |
| `display`                                                               | [models.ListPlansPriceDisplay](../models/list-plans-price-display.md)   | :heavy_minus_sign:                                                      | Display text for showing this price in pricing pages.                   |