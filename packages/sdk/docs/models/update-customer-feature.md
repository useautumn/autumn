# UpdateCustomerFeature

## Example Usage

```typescript
import { UpdateCustomerFeature } from "@useautumn/sdk";

let value: UpdateCustomerFeature = {
  id: "<id>",
  name: "<value>",
  type: "metered",
  consumable: false,
  archived: true,
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                                                                              | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `name`                                                                            | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `type`                                                                            | [models.UpdateCustomerType](../models/update-customer-type.md)                    | :heavy_check_mark:                                                                | N/A                                                                               |
| `consumable`                                                                      | *boolean*                                                                         | :heavy_check_mark:                                                                | N/A                                                                               |
| `eventNames`                                                                      | *string*[]                                                                        | :heavy_minus_sign:                                                                | N/A                                                                               |
| `creditSchema`                                                                    | [models.UpdateCustomerCreditSchema](../models/update-customer-credit-schema.md)[] | :heavy_minus_sign:                                                                | N/A                                                                               |
| `display`                                                                         | [models.UpdateCustomerDisplay](../models/update-customer-display.md)              | :heavy_minus_sign:                                                                | N/A                                                                               |
| `archived`                                                                        | *boolean*                                                                         | :heavy_check_mark:                                                                | N/A                                                                               |