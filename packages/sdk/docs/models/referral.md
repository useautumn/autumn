# Referral

## Example Usage

```typescript
import { Referral } from "@useautumn/sdk";

let value: Referral = {
  programId: "<id>",
  customer: {},
  rewardApplied: false,
};
```

## Fields

| Field                                                     | Type                                                      | Required                                                  | Description                                               |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `programId`                                               | *string*                                                  | :heavy_check_mark:                                        | N/A                                                       |
| `customer`                                                | [models.ReferralCustomer](../models/referral-customer.md) | :heavy_check_mark:                                        | N/A                                                       |
| `rewardApplied`                                           | *boolean*                                                 | :heavy_check_mark:                                        | N/A                                                       |