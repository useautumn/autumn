# SetupPaymentResponse

OK

## Example Usage

```typescript
import { SetupPaymentResponse } from "@useautumn/sdk";

let value: SetupPaymentResponse = {
  customerId: "cus_123",
  url: "https://bowed-hovercraft.com/",
};
```

## Fields

| Field                         | Type                          | Required                      | Description                   |
| ----------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| `customerId`                  | *string*                      | :heavy_check_mark:            | The ID of the customer        |
| `url`                         | *string*                      | :heavy_check_mark:            | URL to the payment setup page |