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
| `amount`                                                                        | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `interval`                                                                      | [models.BillingAttachPriceInterval](../models/billing-attach-price-interval.md) | :heavy_check_mark:                                                              | N/A                                                                             |
| `intervalCount`                                                                 | *number*                                                                        | :heavy_minus_sign:                                                              | N/A                                                                             |