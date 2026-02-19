# ListCustomersPrice

## Example Usage

```typescript
import { ListCustomersPrice } from "@useautumn/sdk";

let value: ListCustomersPrice = {
  billingUnits: 7963.03,
  billingMethod: "usage_based",
  maxPurchase: 9606.84,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `amount`                                                                        | *number*                                                                        | :heavy_minus_sign:                                                              | The per-unit price amount.                                                      |
| `tiers`                                                                         | [models.ListCustomersTier](../models/list-customers-tier.md)[]                  | :heavy_minus_sign:                                                              | Tiered pricing configuration if applicable.                                     |
| `billingUnits`                                                                  | *number*                                                                        | :heavy_check_mark:                                                              | The number of units per billing increment (eg. $9 / 250 units).                 |
| `billingMethod`                                                                 | [models.ListCustomersBillingMethod](../models/list-customers-billing-method.md) | :heavy_check_mark:                                                              | Whether usage is prepaid or billed pay-per-use.                                 |
| `maxPurchase`                                                                   | *number*                                                                        | :heavy_check_mark:                                                              | Maximum quantity that can be purchased, or null for unlimited.                  |