# BillingAttachPrice

## Example Usage

```typescript
import { BillingAttachPrice } from "@useautumn/sdk";

let value: BillingAttachPrice = {
  amount: 1009.42,
  interval: "one_off",
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_check_mark:                                                              | Base price amount for the plan.                                                 |
| `interval`                                                                      | [models.BillingAttachPriceInterval](../models/billing-attach-price-interval.md) | :heavy_check_mark:                                                              | Billing interval (e.g. 'month', 'year').                                        |
| `intervalCount`                                                                 | *number*                                                                        | :heavy_minus_sign:                                                              | Number of intervals per billing cycle. Defaults to 1.                           |