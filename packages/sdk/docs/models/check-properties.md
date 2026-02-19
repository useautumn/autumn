# CheckProperties

## Example Usage

```typescript
import { CheckProperties } from "@useautumn/sdk";

let value: CheckProperties = {
  isFree: true,
  isOneOff: true,
};
```

## Fields

| Field                                                                                                     | Type                                                                                                      | Required                                                                                                  | Description                                                                                               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `isFree`                                                                                                  | *boolean*                                                                                                 | :heavy_check_mark:                                                                                        | True if the product has no base price or usage prices                                                     |
| `isOneOff`                                                                                                | *boolean*                                                                                                 | :heavy_check_mark:                                                                                        | True if the product only contains a one-time price                                                        |
| `intervalGroup`                                                                                           | *string*                                                                                                  | :heavy_minus_sign:                                                                                        | The billing interval group for recurring products (e.g., 'monthly', 'yearly')                             |
| `hasTrial`                                                                                                | *boolean*                                                                                                 | :heavy_minus_sign:                                                                                        | True if the product includes a free trial                                                                 |
| `updateable`                                                                                              | *boolean*                                                                                                 | :heavy_minus_sign:                                                                                        | True if the product can be updated after creation (only applicable if there are prepaid recurring prices) |