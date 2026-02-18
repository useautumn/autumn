# BillingSetupPaymentResponse

OK

## Example Usage

```typescript
import { BillingSetupPaymentResponse } from "@useautumn/sdk";

let value: BillingSetupPaymentResponse = {
  customerId: "<id>",
  url: "https://teeming-backbone.name",
};
```

## Fields

| Field                         | Type                          | Required                      | Description                   |
| ----------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| `customerId`                  | *string*                      | :heavy_check_mark:            | The ID of the customer        |
| `url`                         | *string*                      | :heavy_check_mark:            | URL to the payment setup page |