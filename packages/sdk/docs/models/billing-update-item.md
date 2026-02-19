# BillingUpdateItem

## Example Usage

```typescript
import { BillingUpdateItem } from "@useautumn/sdk";

let value: BillingUpdateItem = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `featureId`                                                                                  | *string*                                                                                     | :heavy_check_mark:                                                                           | The ID of the feature to configure.                                                          |
| `included`                                                                                   | *number*                                                                                     | :heavy_minus_sign:                                                                           | Number of free units included. Balance resets to this each interval for consumable features. |
| `unlimited`                                                                                  | *boolean*                                                                                    | :heavy_minus_sign:                                                                           | If true, customer has unlimited access to this feature.                                      |
| `reset`                                                                                      | [models.BillingUpdateReset](../models/billing-update-reset.md)                               | :heavy_minus_sign:                                                                           | Reset configuration for consumable features. Omit for non-consumable features like seats.    |
| `price`                                                                                      | [models.BillingUpdateItemPrice](../models/billing-update-item-price.md)                      | :heavy_minus_sign:                                                                           | Pricing for usage beyond included units. Omit for free features.                             |
| `proration`                                                                                  | [models.BillingUpdateProration](../models/billing-update-proration.md)                       | :heavy_minus_sign:                                                                           | Proration settings for prepaid features. Controls mid-cycle quantity change billing.         |
| `rollover`                                                                                   | [models.BillingUpdateRollover](../models/billing-update-rollover.md)                         | :heavy_minus_sign:                                                                           | Rollover config for unused units. If set, unused included units carry over.                  |