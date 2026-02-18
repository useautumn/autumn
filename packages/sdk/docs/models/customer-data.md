# CustomerData

Customer details to set when creating a customer

## Example Usage

```typescript
import { CustomerData } from "@useautumn/sdk";

let value: CustomerData = {};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `name`                                                                                           | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's name                                                                                  |
| `email`                                                                                          | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's email address                                                                         |
| `fingerprint`                                                                                    | *string*                                                                                         | :heavy_minus_sign:                                                                               | Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse |
| `metadata`                                                                                       | Record<string, *any*>                                                                            | :heavy_minus_sign:                                                                               | Additional metadata for the customer                                                             |
| `stripeId`                                                                                       | *string*                                                                                         | :heavy_minus_sign:                                                                               | Stripe customer ID if you already have one                                                       |
| `createInStripe`                                                                                 | *boolean*                                                                                        | :heavy_minus_sign:                                                                               | Whether to create the customer in Stripe                                                         |
| `autoEnablePlanId`                                                                               | *string*                                                                                         | :heavy_minus_sign:                                                                               | The ID of the free plan to auto-enable for the customer                                          |
| `sendEmailReceipts`                                                                              | *boolean*                                                                                        | :heavy_minus_sign:                                                                               | Whether to send email receipts to this customer                                                  |