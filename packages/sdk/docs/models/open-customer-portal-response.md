# OpenCustomerPortalResponse

OK

## Example Usage

```typescript
import { OpenCustomerPortalResponse } from "@useautumn/sdk";

let value: OpenCustomerPortalResponse = {
  customerId: "cus_123",
  url: "https://billing.stripe.com/session/...",
};
```

## Fields

| Field                                | Type                                 | Required                             | Description                          |
| ------------------------------------ | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| `customerId`                         | *string*                             | :heavy_check_mark:                   | The ID of the billing portal session |
| `url`                                | *string*                             | :heavy_check_mark:                   | URL to the billing portal            |