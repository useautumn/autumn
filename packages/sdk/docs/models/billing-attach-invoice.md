# BillingAttachInvoice

Invoice details if an invoice was created. Only present when a charge was made.

## Example Usage

```typescript
import { BillingAttachInvoice } from "@useautumn/sdk";

let value: BillingAttachInvoice = {
  status: "<value>",
  stripeId: "<id>",
  total: 1014.94,
  currency: "Tenge",
  hostedInvoiceUrl: "https://polite-premium.org/",
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