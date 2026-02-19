# BillingUpdatePrice

## Example Usage

```typescript
import { BillingUpdatePrice } from "@useautumn/sdk";

let value: BillingUpdatePrice = {
  amount: 5336.39,
  interval: "week",
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_check_mark:                                                              | Base price amount for the plan.                                                 |
| `interval`                                                                      | [models.BillingUpdatePriceInterval](../models/billing-update-price-interval.md) | :heavy_check_mark:                                                              | Billing interval (e.g. 'month', 'year').                                        |
| `intervalCount`                                                                 | *number*                                                                        | :heavy_minus_sign:                                                              | Number of intervals per billing cycle. Defaults to 1.                           |