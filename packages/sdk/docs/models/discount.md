# Discount

## Example Usage

```typescript
import { Discount } from "@useautumn/sdk";

let value: Discount = {
  name: "<value>",
  type: "free_product",
  discountValue: 8208.57,
  durationType: "forever",
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `name`                                                                 | *string*                                                               | :heavy_check_mark:                                                     | The name of the discount or coupon                                     |
| `type`                                                                 | [models.Type](../models/type.md)                                       | :heavy_check_mark:                                                     | The type of reward                                                     |
| `discountValue`                                                        | *number*                                                               | :heavy_check_mark:                                                     | The discount value (percentage or fixed amount)                        |
| `durationType`                                                         | [models.CustomerDurationType](../models/customer-duration-type.md)     | :heavy_check_mark:                                                     | How long the discount lasts                                            |
| `durationValue`                                                        | *number*                                                               | :heavy_minus_sign:                                                     | Number of billing periods the discount applies for repeating durations |
| `currency`                                                             | *string*                                                               | :heavy_minus_sign:                                                     | The currency code for fixed amount discounts                           |
| `start`                                                                | *number*                                                               | :heavy_minus_sign:                                                     | Timestamp when the discount becomes active                             |
| `end`                                                                  | *number*                                                               | :heavy_minus_sign:                                                     | Timestamp when the discount expires                                    |
| `subscriptionId`                                                       | *string*                                                               | :heavy_minus_sign:                                                     | The Stripe subscription ID this discount is applied to                 |
| `totalDiscountAmount`                                                  | *number*                                                               | :heavy_minus_sign:                                                     | Total amount saved from this discount                                  |