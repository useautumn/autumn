# OutgoingFeature

## Example Usage

```typescript
import { OutgoingFeature } from "@useautumn/sdk";

let value: OutgoingFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: true,
  archived: false,
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                                                                 | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `name`                                                               | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `type`                                                               | [models.OutgoingType](../models/outgoing-type.md)                    | :heavy_check_mark:                                                   | N/A                                                                  |
| `consumable`                                                         | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |
| `eventNames`                                                         | *string*[]                                                           | :heavy_minus_sign:                                                   | N/A                                                                  |
| `creditSchema`                                                       | [models.OutgoingCreditSchema](../models/outgoing-credit-schema.md)[] | :heavy_minus_sign:                                                   | N/A                                                                  |
| `display`                                                            | [models.OutgoingDisplay](../models/outgoing-display.md)              | :heavy_minus_sign:                                                   | N/A                                                                  |
| `archived`                                                           | *boolean*                                                            | :heavy_check_mark:                                                   | N/A                                                                  |