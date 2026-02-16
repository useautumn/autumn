# Invoice

## Example Usage

```typescript
import { Invoice } from "@useautumn/sdk";

let value: Invoice = {
  planIds: [],
  stripeId: "<id>",
  status: "<value>",
  total: 9115.15,
  currency: "New Zealand Dollar",
  createdAt: 1973.3,
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