# PreviewUpdatePrice

## Example Usage

```typescript
import { PreviewUpdatePrice } from "@useautumn/sdk";

let value: PreviewUpdatePrice = {
  amount: 8816.64,
  interval: "semi_annual",
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_check_mark:                                                              | Base price amount for the plan.                                                 |
| `interval`                                                                      | [models.PreviewUpdatePriceInterval](../models/preview-update-price-interval.md) | :heavy_check_mark:                                                              | Billing interval (e.g. 'month', 'year').                                        |
| `intervalCount`                                                                 | *number*                                                                        | :heavy_minus_sign:                                                              | Number of intervals per billing cycle. Defaults to 1.                           |