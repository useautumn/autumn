# GetOrCreateCustomerParams

## Example Usage

```typescript
import { GetOrCreateCustomerParams } from "@useautumn/sdk";

let value: GetOrCreateCustomerParams = {
  customerId: "cus_123",
  name: "John Doe",
  email: "john@example.com",
};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `customerId`                                                                                     | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `name`                                                                                           | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's name                                                                                  |
| `email`                                                                                          | *string*                                                                                         | :heavy_minus_sign:                                                                               | Customer's email address                                                                         |
| `fingerprint`                                                                                    | *string*                                                                                         | :heavy_minus_sign:                                                                               | Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse |
| `metadata`                                                                                       | Record<string, *any*>                                                                            | :heavy_minus_sign:                                                                               | Additional metadata for the customer                                                             |
| `stripeId`                                                                                       | *string*                                                                                         | :heavy_minus_sign:                                                                               | Stripe customer ID if you already have one                                                       |
| `createInStripe`                                                                                 | *boolean*                                                                                        | :heavy_minus_sign:                                                                               | Whether to create the customer in Stripe                                                         |
| `autoEnablePlanId`                                                                               | *string*                                                                                         | :heavy_minus_sign:                                                                               | The ID of the free plan to auto-enable for the customer                                          |
| `sendEmailReceipts`                                                                              | *boolean*                                                                                        | :heavy_minus_sign:                                                                               | Whether to send email receipts to this customer                                                  |
| `expand`                                                                                         | [models.CustomerExpand](../models/customer-expand.md)[]                                          | :heavy_minus_sign:                                                                               | Customer expand options                                                                          |