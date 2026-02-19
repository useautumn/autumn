# RedeemReferralCodeParams

## Example Usage

```typescript
import { RedeemReferralCodeParams } from "@useautumn/sdk";

let value: RedeemReferralCodeParams = {
  code: "REF123",
  customerId: "cus_456",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `code`                                                   | *string*                                                 | :heavy_check_mark:                                       | The referral code to redeem                              |
| `customerId`                                             | *string*                                                 | :heavy_check_mark:                                       | The unique identifier of the customer redeeming the code |