# CreateBalanceParams

## Example Usage

```typescript
import { CreateBalanceParams } from "@useautumn/sdk";

let value: CreateBalanceParams = {
  customerId: "cus_123",
  featureId: "api_calls",
  included: 1000,
  reset: {
    interval: "month",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `customerId`                                                                                                 | *string*                                                                                                     | :heavy_check_mark:                                                                                           | The ID of the customer.                                                                                      |
| `featureId`                                                                                                  | *string*                                                                                                     | :heavy_check_mark:                                                                                           | The ID of the feature.                                                                                       |
| `entityId`                                                                                                   | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                     |
| `included`                                                                                                   | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | The initial balance amount to grant. For metered features, this is the number of units the customer can use. |
| `unlimited`                                                                                                  | *boolean*                                                                                                    | :heavy_minus_sign:                                                                                           | If true, the balance has unlimited usage. Cannot be combined with 'included'.                                |
| `reset`                                                                                                      | [models.CreateBalanceReset](../models/create-balance-reset.md)                                               | :heavy_minus_sign:                                                                                           | Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.     |
| `expiresAt`                                                                                                  | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Unix timestamp (milliseconds) when the balance expires. Mutually exclusive with reset.                       |
| `grantedBalance`                                                                                             | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |