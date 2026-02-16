# ListCustomersParams

## Example Usage

```typescript
import { ListCustomersParams } from "@useautumn/sdk";

let value: ListCustomersParams = {};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `offset`                                                                                 | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of items to skip                                                                  |
| `limit`                                                                                  | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of items to return. Default 10, max 1000.                                         |
| `plans`                                                                                  | [models.ListCustomersPlan](../models/list-customers-plan.md)[]                           | :heavy_minus_sign:                                                                       | Filter by plan ID and version. Returns customers with active subscriptions to this plan. |
| `subscriptionStatus`                                                                     | [models.SubscriptionStatus](../models/subscription-status.md)                            | :heavy_minus_sign:                                                                       | Filter by customer product status. Defaults to active and scheduled                      |
| `search`                                                                                 | *string*                                                                                 | :heavy_minus_sign:                                                                       | Search customers by id, name, or email                                                   |