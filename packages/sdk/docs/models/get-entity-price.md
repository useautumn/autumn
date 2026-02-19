# GetEntityPrice

## Example Usage

```typescript
import { GetEntityPrice } from "@useautumn/sdk";

let value: GetEntityPrice = {
  billingUnits: 7241.11,
  billingMethod: "usage_based",
  maxPurchase: 6870.54,
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `amount`                                                                | *number*                                                                | :heavy_minus_sign:                                                      | The per-unit price amount.                                              |
| `tiers`                                                                 | [models.GetEntityTier](../models/get-entity-tier.md)[]                  | :heavy_minus_sign:                                                      | Tiered pricing configuration if applicable.                             |
| `billingUnits`                                                          | *number*                                                                | :heavy_check_mark:                                                      | The number of units per billing increment (eg. $9 / 250 units).         |
| `billingMethod`                                                         | [models.GetEntityBillingMethod](../models/get-entity-billing-method.md) | :heavy_check_mark:                                                      | Whether usage is prepaid or billed pay-per-use.                         |
| `maxPurchase`                                                           | *number*                                                                | :heavy_check_mark:                                                      | Maximum quantity that can be purchased, or null for unlimited.          |