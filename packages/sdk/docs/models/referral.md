# Referral

## Example Usage

```typescript
import { Referral } from "@useautumn/sdk";

let value: Referral = {
  programId: "<id>",
  customer: {
    id: "<id>",
  },
  rewardApplied: false,
  createdAt: 6538.56,
};
```

## Fields

| Field                                                     | Type                                                      | Required                                                  | Description                                               |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `programId`                                               | *string*                                                  | :heavy_check_mark:                                        | N/A                                                       |
| `customer`                                                | [models.ReferralCustomer](../models/referral-customer.md) | :heavy_check_mark:                                        | N/A                                                       |
| `rewardApplied`                                           | *boolean*                                                 | :heavy_check_mark:                                        | N/A                                                       |
| `createdAt`                                               | *number*                                                  | :heavy_check_mark:                                        | N/A                                                       |