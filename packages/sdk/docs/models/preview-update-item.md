# PreviewUpdateItem

## Example Usage

```typescript
import { PreviewUpdateItem } from "@useautumn/sdk";

let value: PreviewUpdateItem = {
  featureId: "<id>",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `featureId`                                                                                  | *string*                                                                                     | :heavy_check_mark:                                                                           | The ID of the feature to configure.                                                          |
| `included`                                                                                   | *number*                                                                                     | :heavy_minus_sign:                                                                           | Number of free units included. Balance resets to this each interval for consumable features. |
| `unlimited`                                                                                  | *boolean*                                                                                    | :heavy_minus_sign:                                                                           | If true, customer has unlimited access to this feature.                                      |
| `reset`                                                                                      | [models.PreviewUpdateReset](../models/preview-update-reset.md)                               | :heavy_minus_sign:                                                                           | Reset configuration for consumable features. Omit for non-consumable features like seats.    |
| `price`                                                                                      | [models.PreviewUpdateItemPrice](../models/preview-update-item-price.md)                      | :heavy_minus_sign:                                                                           | Pricing for usage beyond included units. Omit for free features.                             |
| `proration`                                                                                  | [models.PreviewUpdateProration](../models/preview-update-proration.md)                       | :heavy_minus_sign:                                                                           | Proration settings for prepaid features. Controls mid-cycle quantity change billing.         |
| `rollover`                                                                                   | [models.PreviewUpdateRollover](../models/preview-update-rollover.md)                         | :heavy_minus_sign:                                                                           | Rollover config for unused units. If set, unused included units carry over.                  |