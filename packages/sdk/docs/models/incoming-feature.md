# IncomingFeature

## Example Usage

```typescript
import { IncomingFeature } from "@useautumn/sdk";

let value: IncomingFeature = {
  id: "<id>",
  name: "<value>",
  type: "credit_system",
  consumable: true,
  archived: true,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                                                                 | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `name`                                                               | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `type`                                                               | [models.IncomingType](../models/incoming-type.md)                    | :heavy_check_mark:                                                   | N/A                                                                  |
| `consumable`                                                         | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |
| `eventNames`                                                         | *string*[]                                                           | :heavy_minus_sign:                                                   | N/A                                                                  |
| `creditSchema`                                                       | [models.IncomingCreditSchema](../models/incoming-credit-schema.md)[] | :heavy_minus_sign:                                                   | N/A                                                                  |
| `display`                                                            | [models.IncomingDisplay](../models/incoming-display.md)              | :heavy_minus_sign:                                                   | N/A                                                                  |
| `archived`                                                           | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |