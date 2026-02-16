# Rewards

## Example Usage

```typescript
import { Rewards } from "@useautumn/sdk";

let value: Rewards = {
  discounts: [
    {
      name: "<value>",
      type: "invoice_credits",
      discountValue: 8349.54,
      durationType: "one_off",
    },
  ],
};
```

## Fields

| Field                                             | Type                                              | Required                                          | Description                                       |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `discounts`                                       | [models.Discount](../models/discount.md)[]        | :heavy_check_mark:                                | Array of active discounts applied to the customer |