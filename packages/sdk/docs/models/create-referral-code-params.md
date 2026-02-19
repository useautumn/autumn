# CreateReferralCodeParams

## Example Usage

```typescript
import { CreateReferralCodeParams } from "@useautumn/sdk";

let value: CreateReferralCodeParams = {
  customerId: "cus_123",
  programId: "prog_123",
};
```

## Fields

| Field                                 | Type                                  | Required                              | Description                           |
| ------------------------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------- |
| `customerId`                          | *string*                              | :heavy_check_mark:                    | The unique identifier of the customer |
| `programId`                           | *string*                              | :heavy_check_mark:                    | ID of your referral program           |