# PreviewAttachPrice

## Example Usage

```typescript
import { PreviewAttachPrice } from "@useautumn/sdk";

let value: PreviewAttachPrice = {
  amount: 547.97,
  interval: "year",
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_check_mark:                                                              | Base price amount for the plan.                                                 |
| `interval`                                                                      | [models.PreviewAttachPriceInterval](../models/preview-attach-price-interval.md) | :heavy_check_mark:                                                              | Billing interval (e.g. 'month', 'year').                                        |
| `intervalCount`                                                                 | *number*                                                                        | :heavy_minus_sign:                                                              | Number of intervals per billing cycle. Defaults to 1.                           |