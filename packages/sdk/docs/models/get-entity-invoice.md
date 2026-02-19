# GetEntityInvoice

## Example Usage

```typescript
import { GetEntityInvoice } from "@useautumn/sdk";

let value: GetEntityInvoice = {
  planIds: [],
  stripeId: "<id>",
  status: "<value>",
  total: 9799.6,
  currency: "Barbados Dollar",
  createdAt: 6472.17,
};
```

## Fields

| Field                                      | Type                                       | Required                                   | Description                                |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `planIds`                                  | *string*[]                                 | :heavy_check_mark:                         | Array of plan IDs included in this invoice |
| `stripeId`                                 | *string*                                   | :heavy_check_mark:                         | The Stripe invoice ID                      |
| `status`                                   | *string*                                   | :heavy_check_mark:                         | The status of the invoice                  |
| `total`                                    | *number*                                   | :heavy_check_mark:                         | The total amount of the invoice            |
| `currency`                                 | *string*                                   | :heavy_check_mark:                         | The currency code for the invoice          |
| `createdAt`                                | *number*                                   | :heavy_check_mark:                         | Timestamp when the invoice was created     |
| `hostedInvoiceUrl`                         | *string*                                   | :heavy_minus_sign:                         | URL to the Stripe-hosted invoice page      |