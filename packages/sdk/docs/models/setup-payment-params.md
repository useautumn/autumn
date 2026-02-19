# SetupPaymentParams

## Example Usage

```typescript
import { SetupPaymentParams } from "@useautumn/sdk";

let value: SetupPaymentParams = {
  customerId: "cus_123",
  successUrl: "https://example.com/account/billing",
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `customerId`                                                                                  | *string*                                                                                      | :heavy_check_mark:                                                                            | The ID of the customer                                                                        |
| `successUrl`                                                                                  | *string*                                                                                      | :heavy_minus_sign:                                                                            | URL to redirect to after successful payment setup. Must start with either http:// or https:// |
| `customerData`                                                                                | [models.CustomerData](../models/customer-data.md)                                             | :heavy_minus_sign:                                                                            | Customer details to set when creating a customer                                              |
| `checkoutSessionParams`                                                                       | Record<string, *any*>                                                                         | :heavy_minus_sign:                                                                            | Additional parameters for the checkout session                                                |