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
| `amount`                                                                        | *number*                                                                        | :heavy_minus_sign:                                                              | N/A                                                                             |
| `tiers`                                                                         | [models.ListCustomersTier](../models/list-customers-tier.md)[]                  | :heavy_minus_sign:                                                              | N/A                                                                             |
| `billingUnits`                                                                  | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `billingMethod`                                                                 | [models.ListCustomersBillingMethod](../models/list-customers-billing-method.md) | :heavy_check_mark:                                                              | N/A                                                                             |
| `maxPurchase`                                                                   | *number*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |