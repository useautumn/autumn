# BillingUpdateInvoice

Invoice details if an invoice was created. Only present when a charge was made.

## Example Usage

```typescript
import { BillingUpdateInvoice } from "@useautumn/sdk";

let value: BillingUpdateInvoice = {
  status: "<value>",
  stripeId: "<id>",
  total: 4797.2,
  currency: "South Sudanese pound",
  hostedInvoiceUrl: "https://cruel-distinction.com",
};
```

## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `status`                                                                        | *string*                                                                        | :heavy_check_mark:                                                              | The status of the invoice (e.g., 'paid', 'open', 'draft').                      |
| `stripeId`                                                                      | *string*                                                                        | :heavy_check_mark:                                                              | The Stripe invoice ID.                                                          |
| `total`                                                                         | *number*                                                                        | :heavy_check_mark:                                                              | The total amount of the invoice in cents.                                       |
| `currency`                                                                      | *string*                                                                        | :heavy_check_mark:                                                              | The three-letter ISO currency code (e.g., 'usd').                               |
| `hostedInvoiceUrl`                                                              | *string*                                                                        | :heavy_check_mark:                                                              | URL to the hosted invoice page where the customer can view and pay the invoice. |