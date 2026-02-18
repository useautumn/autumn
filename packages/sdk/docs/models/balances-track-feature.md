# BalancesTrackFeature

## Example Usage

```typescript
import { BalancesTrackFeature } from "@useautumn/sdk";

let value: BalancesTrackFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: true,
  archived: true,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `id`                                                                            | *string*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `name`                                                                          | *string*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `type`                                                                          | [models.BalancesTrackType](../models/balances-track-type.md)                    | :heavy_check_mark:                                                              | N/A                                                                             |
| `consumable`                                                                    | *boolean*                                                                       | :heavy_check_mark:                                                              | N/A                                                                             |
| `eventNames`                                                                    | *string*[]                                                                      | :heavy_minus_sign:                                                              | N/A                                                                             |
| `creditSchema`                                                                  | [models.BalancesTrackCreditSchema](../models/balances-track-credit-schema.md)[] | :heavy_minus_sign:                                                              | N/A                                                                             |
| `display`                                                                       | [models.BalancesTrackDisplay](../models/balances-track-display.md)              | :heavy_minus_sign:                                                              | N/A                                                                             |
| `archived`                                                                      | *boolean*                                                                       | :heavy_check_mark:                                                              | N/A                                                                             |