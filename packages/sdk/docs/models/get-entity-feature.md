# GetEntityFeature

The full feature object if expanded.

## Example Usage

```typescript
import { GetEntityFeature } from "@useautumn/sdk";

let value: GetEntityFeature = {
  id: "<id>",
  name: "<value>",
  type: "metered",
  consumable: false,
  archived: false,
};
```

## Fields

| Field                                                                   | Type                                                                    | Required                                                                | Description                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `id`                                                                    | *string*                                                                | :heavy_check_mark:                                                      | N/A                                                                     |
| `name`                                                                  | *string*                                                                | :heavy_check_mark:                                                      | N/A                                                                     |
| `type`                                                                  | [models.GetEntityType](../models/get-entity-type.md)                    | :heavy_check_mark:                                                      | N/A                                                                     |
| `consumable`                                                            | *boolean*                                                               | :heavy_check_mark:                                                      | N/A                                                                     |
| `eventNames`                                                            | *string*[]                                                              | :heavy_minus_sign:                                                      | N/A                                                                     |
| `creditSchema`                                                          | [models.GetEntityCreditSchema](../models/get-entity-credit-schema.md)[] | :heavy_minus_sign:                                                      | N/A                                                                     |
| `display`                                                               | [models.GetEntityDisplay](../models/get-entity-display.md)              | :heavy_minus_sign:                                                      | N/A                                                                     |
| `archived`                                                              | *boolean*                                                               | :heavy_check_mark:                                                      | N/A                                                                     |