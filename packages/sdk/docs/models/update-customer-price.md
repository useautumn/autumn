# UpdateCustomerPrice

## Example Usage

```typescript
import { UpdateCustomerPrice } from "@useautumn/sdk";

let value: UpdateCustomerPrice = {
  billingUnits: 5006.02,
  billingMethod: "usage_based",
  maxPurchase: 9037.13,
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `amount`                                                                          | *number*                                                                          | :heavy_minus_sign:                                                                | N/A                                                                               |
| `tiers`                                                                           | [models.UpdateCustomerTier](../models/update-customer-tier.md)[]                  | :heavy_minus_sign:                                                                | N/A                                                                               |
| `billingUnits`                                                                    | *number*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `billingMethod`                                                                   | [models.UpdateCustomerBillingMethod](../models/update-customer-billing-method.md) | :heavy_check_mark:                                                                | N/A                                                                               |
| `maxPurchase`                                                                     | *number*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |