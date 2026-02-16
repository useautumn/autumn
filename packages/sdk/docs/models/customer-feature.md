# CustomerFeature

## Example Usage

```typescript
import { CustomerFeature } from "@useautumn/sdk";

let value: CustomerFeature = {
  id: "<id>",
  name: "<value>",
  type: "metered",
  consumable: false,
  archived: true,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                                                                 | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `name`                                                               | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `type`                                                               | [models.CustomerBalancesType](../models/customer-balances-type.md)   | :heavy_check_mark:                                                   | N/A                                                                  |
| `consumable`                                                         | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |
| `eventNames`                                                         | *string*[]                                                           | :heavy_minus_sign:                                                   | N/A                                                                  |
| `creditSchema`                                                       | [models.CustomerCreditSchema](../models/customer-credit-schema.md)[] | :heavy_minus_sign:                                                   | N/A                                                                  |
| `display`                                                            | [models.CustomerDisplay](../models/customer-display.md)              | :heavy_minus_sign:                                                   | N/A                                                                  |
| `archived`                                                           | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |