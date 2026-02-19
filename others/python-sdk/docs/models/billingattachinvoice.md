# BillingAttachInvoice

Invoice details if an invoice was created. Only present when a charge was made.


## Fields

| Field                                                                           | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `status`                                                                        | *Nullable[str]*                                                                 | :heavy_check_mark:                                                              | The status of the invoice (e.g., 'paid', 'open', 'draft').                      |
| `stripe_id`                                                                     | *str*                                                                           | :heavy_check_mark:                                                              | The Stripe invoice ID.                                                          |
| `total`                                                                         | *float*                                                                         | :heavy_check_mark:                                                              | The total amount of the invoice in cents.                                       |
| `currency`                                                                      | *str*                                                                           | :heavy_check_mark:                                                              | The three-letter ISO currency code (e.g., 'usd').                               |
| `hosted_invoice_url`                                                            | *Nullable[str]*                                                                 | :heavy_check_mark:                                                              | URL to the hosted invoice page where the customer can view and pay the invoice. |