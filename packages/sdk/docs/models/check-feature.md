# CheckFeature

The full feature object if expanded.

## Example Usage

```typescript
import { CheckFeature } from "@useautumn/sdk";

let value: CheckFeature = {
  id: "<id>",
  name: "<value>",
  type: "metered",
  consumable: false,
  archived: true,
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                                                             | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `name`                                                           | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `type`                                                           | [models.CheckBalanceType](../models/check-balance-type.md)       | :heavy_check_mark:                                               | N/A                                                              |
| `consumable`                                                     | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |
| `eventNames`                                                     | *string*[]                                                       | :heavy_minus_sign:                                               | N/A                                                              |
| `creditSchema`                                                   | [models.CheckCreditSchema](../models/check-credit-schema.md)[]   | :heavy_minus_sign:                                               | N/A                                                              |
| `display`                                                        | [models.CheckBalanceDisplay](../models/check-balance-display.md) | :heavy_minus_sign:                                               | N/A                                                              |
| `archived`                                                       | *boolean*                                                        | :heavy_check_mark:                                               | N/A                                                              |