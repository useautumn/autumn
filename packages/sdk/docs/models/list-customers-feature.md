# ListCustomersFeature

## Example Usage

```typescript
import { ListCustomersFeature } from "@useautumn/sdk";

let value: ListCustomersFeature = {
  id: "<id>",
  name: "<value>",
  type: "metered",
  consumable: false,
  archived: true,
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `id`                                                                            | *string*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `name`                                                                          | *string*                                                                        | :heavy_check_mark:                                                              | N/A                                                                             |
| `type`                                                                          | [models.ListCustomersType](../models/list-customers-type.md)                    | :heavy_check_mark:                                                              | N/A                                                                             |
| `consumable`                                                                    | *boolean*                                                                       | :heavy_check_mark:                                                              | N/A                                                                             |
| `eventNames`                                                                    | *string*[]                                                                      | :heavy_minus_sign:                                                              | N/A                                                                             |
| `creditSchema`                                                                  | [models.ListCustomersCreditSchema](../models/list-customers-credit-schema.md)[] | :heavy_minus_sign:                                                              | N/A                                                                             |
| `display`                                                                       | [models.ListCustomersDisplay](../models/list-customers-display.md)              | :heavy_minus_sign:                                                              | N/A                                                                             |
| `archived`                                                                      | *boolean*                                                                       | :heavy_check_mark:                                                              | N/A                                                                             |