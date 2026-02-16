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

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `amount`                                            | *number*                                            | :heavy_check_mark:                                  | N/A                                                 |
| `interval`                                          | [models.PriceInterval](../models/price-interval.md) | :heavy_check_mark:                                  | N/A                                                 |
| `intervalCount`                                     | *number*                                            | :heavy_minus_sign:                                  | N/A                                                 |
| `display`                                           | [models.PriceDisplay](../models/price-display.md)   | :heavy_minus_sign:                                  | N/A                                                 |