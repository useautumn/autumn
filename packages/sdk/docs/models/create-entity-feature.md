# CreateEntityFeature

The full feature object if expanded.

## Example Usage

```typescript
import { CreateEntityFeature } from "@useautumn/sdk";

let value: CreateEntityFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: false,
  archived: false,
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                                                                          | *string*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `name`                                                                        | *string*                                                                      | :heavy_check_mark:                                                            | N/A                                                                           |
| `type`                                                                        | [models.CreateEntityType](../models/create-entity-type.md)                    | :heavy_check_mark:                                                            | N/A                                                                           |
| `consumable`                                                                  | *boolean*                                                                     | :heavy_check_mark:                                                            | N/A                                                                           |
| `eventNames`                                                                  | *string*[]                                                                    | :heavy_minus_sign:                                                            | N/A                                                                           |
| `creditSchema`                                                                | [models.CreateEntityCreditSchema](../models/create-entity-credit-schema.md)[] | :heavy_minus_sign:                                                            | N/A                                                                           |
| `display`                                                                     | [models.CreateEntityDisplay](../models/create-entity-display.md)              | :heavy_minus_sign:                                                            | N/A                                                                           |
| `archived`                                                                    | *boolean*                                                                     | :heavy_check_mark:                                                            | N/A                                                                           |