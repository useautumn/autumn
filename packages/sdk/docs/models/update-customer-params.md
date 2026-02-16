# UpdateCustomerParams

## Example Usage

```typescript
import { UpdateCustomerParams } from "@useautumn/sdk";

let value: UpdateCustomerParams = {
  customerId: "cus_123",
  name: "Jane Doe",
  email: "jane@example.com",
};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `customerId`                                                                                     | *string*                                                                                         | :heavy_check_mark:                                                                               | ID of the customer to update                                                                     |
| `name`                                                                                           | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's name                                                                                  |
| `email`                                                                                          | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's email address                                                                         |
| `fingerprint`                                                                                    | *string*                                                                                         | :heavy_minus_sign:                                                                               | Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse |
| `metadata`                                                                                       | Record<string, *any*>                                                                            | :heavy_minus_sign:                                                                               | Additional metadata for the customer                                                             |
| `stripeId`                                                                                       | *string*                                                                                         | :heavy_minus_sign:                                                                               | Stripe customer ID if you already have one                                                       |
| `sendEmailReceipts`                                                                              | *boolean*                                                                                        | :heavy_minus_sign:                                                                               | Whether to send email receipts to this customer                                                  |
| `newCustomerId`                                                                                  | *string*                                                                                         | :heavy_minus_sign:                                                                               | Your unique identifier for the customer                                                          |