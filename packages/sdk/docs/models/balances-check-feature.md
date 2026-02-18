# BalancesCheckFeature

## Example Usage

```typescript
import { BalancesCheckFeature } from "@useautumn/sdk";

let value: BalancesCheckFeature = {
  id: "<id>",
  name: "<value>",
  type: "credit_system",
  consumable: true,
  archived: false,
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                                                                              | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `name`                                                                            | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `type`                                                                            | [models.BalancesCheckBalanceType](../models/balances-check-balance-type.md)       | :heavy_check_mark:                                                                | N/A                                                                               |
| `consumable`                                                                      | *boolean*                                                                         | :heavy_check_mark:                                                                | N/A                                                                               |
| `eventNames`                                                                      | *string*[]                                                                        | :heavy_minus_sign:                                                                | N/A                                                                               |
| `creditSchema`                                                                    | [models.BalancesCheckCreditSchema](../models/balances-check-credit-schema.md)[]   | :heavy_minus_sign:                                                                | N/A                                                                               |
| `display`                                                                         | [models.BalancesCheckBalanceDisplay](../models/balances-check-balance-display.md) | :heavy_minus_sign:                                                                | N/A                                                                               |
| `archived`                                                                        | *boolean*                                                                         | :heavy_check_mark:                                                                | N/A                                                                               |