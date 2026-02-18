# BalancesCreateRequest

## Example Usage

```typescript
import { BalancesCreateRequest } from "@useautumn/sdk";

let value: BalancesCreateRequest = {
  featureId: "<id>",
  customerId: "<id>",
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `featureId`                                                      | *string*                                                         | :heavy_check_mark:                                               | The feature ID to create the balance for                         |
| `customerId`                                                     | *string*                                                         | :heavy_check_mark:                                               | The customer ID to assign the balance to                         |
| `entityId`                                                       | *string*                                                         | :heavy_minus_sign:                                               | Entity ID for entity-scoped balances                             |
| `included`                                                       | *number*                                                         | :heavy_minus_sign:                                               | The initial balance amount to grant                              |
| `unlimited`                                                      | *boolean*                                                        | :heavy_minus_sign:                                               | Whether the balance is unlimited                                 |
| `reset`                                                          | [models.BalancesCreateReset](../models/balances-create-reset.md) | :heavy_minus_sign:                                               | Reset configuration for the balance                              |
| `expiresAt`                                                      | *number*                                                         | :heavy_minus_sign:                                               | Unix timestamp (milliseconds) when the balance expires           |
| `grantedBalance`                                                 | *number*                                                         | :heavy_minus_sign:                                               | N/A                                                              |