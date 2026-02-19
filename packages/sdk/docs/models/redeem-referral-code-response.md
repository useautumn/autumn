# RedeemReferralCodeResponse

OK

## Example Usage

```typescript
import { RedeemReferralCodeResponse } from "@useautumn/sdk";

let value: RedeemReferralCodeResponse = {
  id: "<string>",
  customerId: "<string>",
  rewardId: "<string>",
};
```

## Fields

| Field                                     | Type                                      | Required                                  | Description                               |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| `id`                                      | *string*                                  | :heavy_check_mark:                        | The ID of the redemption event            |
| `customerId`                              | *string*                                  | :heavy_check_mark:                        | Your unique identifier for the customer   |
| `rewardId`                                | *string*                                  | :heavy_check_mark:                        | The ID of the reward that will be granted |