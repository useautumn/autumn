# BalancesTrackBalanceFeature

## Example Usage

```typescript
import { BalancesTrackBalanceFeature } from "@useautumn/sdk";

let value: BalancesTrackBalanceFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: true,
  archived: true,
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                                                                                           | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `name`                                                                                         | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `type`                                                                                         | [models.BalancesTrackBalanceType](../models/balances-track-balance-type.md)                    | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `consumable`                                                                                   | *boolean*                                                                                      | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `eventNames`                                                                                   | *string*[]                                                                                     | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `creditSchema`                                                                                 | [models.BalancesTrackBalanceCreditSchema](../models/balances-track-balance-credit-schema.md)[] | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `display`                                                                                      | [models.BalancesTrackBalanceDisplay](../models/balances-track-balance-display.md)              | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `archived`                                                                                     | *boolean*                                                                                      | :heavy_check_mark:                                                                             | N/A                                                                                            |