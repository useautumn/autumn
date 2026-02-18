# BalancesUpdateRequest

## Example Usage

```typescript
import { BalancesUpdateRequest } from "@useautumn/sdk";

let value: BalancesUpdateRequest = {
  customerId: "<id>",
  featureId: "<id>",
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `customerId`                                                           | *string*                                                               | :heavy_check_mark:                                                     | The ID of the customer.                                                |
| `entityId`                                                             | *string*                                                               | :heavy_minus_sign:                                                     | The ID of the entity to update balance for (if using entity balances). |
| `featureId`                                                            | *string*                                                               | :heavy_check_mark:                                                     | The ID of the feature to update balance for.                           |
| `currentBalance`                                                       | *number*                                                               | :heavy_minus_sign:                                                     | The new balance value to set.                                          |
| `interval`                                                             | [models.BalancesUpdateInterval](../models/balances-update-interval.md) | :heavy_minus_sign:                                                     | The interval to update balance for.                                    |
| `grantedBalance`                                                       | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `usage`                                                                | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `customerEntitlementId`                                                | *string*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `nextResetAt`                                                          | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `addToBalance`                                                         | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |