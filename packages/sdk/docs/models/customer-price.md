# CustomerPrice

## Example Usage

```typescript
import { CustomerPrice } from "@useautumn/sdk";

let value: CustomerPrice = {
  billingUnits: 423.91,
  billingMethod: "prepaid",
  maxPurchase: 1118.93,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `amount`                                                             | *number*                                                             | :heavy_minus_sign:                                                   | N/A                                                                  |
| `tiers`                                                              | [models.CustomerTier](../models/customer-tier.md)[]                  | :heavy_minus_sign:                                                   | N/A                                                                  |
| `billingUnits`                                                       | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `billingMethod`                                                      | [models.CustomerBillingMethod](../models/customer-billing-method.md) | :heavy_check_mark:                                                   | N/A                                                                  |
| `maxPurchase`                                                        | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |