# CreateReferralCodeResponse

OK

## Example Usage

```typescript
import { CreateReferralCodeResponse } from "@useautumn/sdk";

let value: CreateReferralCodeResponse = {
  code: "<string>",
  customerId: "<string>",
  createdAt: 123,
};
```

## Fields

| Field                                               | Type                                                | Required                                            | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `code`                                              | *string*                                            | :heavy_check_mark:                                  | The referral code that can be shared with customers |
| `customerId`                                        | *string*                                            | :heavy_check_mark:                                  | Your unique identifier for the customer             |
| `createdAt`                                         | *number*                                            | :heavy_check_mark:                                  | The timestamp of when the referral code was created |