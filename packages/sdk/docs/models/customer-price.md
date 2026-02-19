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
| `amount`                                                             | *number*                                                             | :heavy_minus_sign:                                                   | The per-unit price amount.                                           |
| `tiers`                                                              | [models.CustomerTier](../models/customer-tier.md)[]                  | :heavy_minus_sign:                                                   | Tiered pricing configuration if applicable.                          |
| `billingUnits`                                                       | *number*                                                             | :heavy_check_mark:                                                   | The number of units per billing increment (eg. $9 / 250 units).      |
| `billingMethod`                                                      | [models.CustomerBillingMethod](../models/customer-billing-method.md) | :heavy_check_mark:                                                   | Whether usage is prepaid or billed pay-per-use.                      |
| `maxPurchase`                                                        | *number*                                                             | :heavy_check_mark:                                                   | Maximum quantity that can be purchased, or null for unlimited.       |