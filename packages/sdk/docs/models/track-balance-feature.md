# TrackBalanceFeature

The full feature object if expanded.

## Example Usage

```typescript
import { TrackBalanceFeature } from "@useautumn/sdk";

let value: TrackBalanceFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: true,
  archived: true,
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                                                                          | *string*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `name`                                                                        | *string*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `type`                                                                        | [models.TrackBalanceType](../models/track-balance-type.md)                    | :heavy_check_mark:                                                            | N/A                                                                           |
| `consumable`                                                                  | *boolean*                                                                     | :heavy_check_mark:                                                            | N/A                                                                           |
| `eventNames`                                                                  | *string*[]                                                                    | :heavy_minus_sign:                                                            | N/A                                                                           |
| `creditSchema`                                                                | [models.TrackBalanceCreditSchema](../models/track-balance-credit-schema.md)[] | :heavy_minus_sign:                                                            | N/A                                                                           |
| `display`                                                                     | [models.TrackBalanceDisplay](../models/track-balance-display.md)              | :heavy_minus_sign:                                                            | N/A                                                                           |
| `archived`                                                                    | *boolean*                                                                     | :heavy_check_mark:                                                            | N/A                                                                           |