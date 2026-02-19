# CreateEntityInvoice


## Fields

| Field                                      | Type                                       | Required                                   | Description                                |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `plan_ids`                                 | List[*str*]                                | :heavy_check_mark:                         | Array of plan IDs included in this invoice |
| `stripe_id`                                | *str*                                      | :heavy_check_mark:                         | The Stripe invoice ID                      |
| `status`                                   | *str*                                      | :heavy_check_mark:                         | The status of the invoice                  |
| `total`                                    | *float*                                    | :heavy_check_mark:                         | The total amount of the invoice            |
| `currency`                                 | *str*                                      | :heavy_check_mark:                         | The currency code for the invoice          |
| `created_at`                               | *float*                                    | :heavy_check_mark:                         | Timestamp when the invoice was created     |
| `hosted_invoice_url`                       | *OptionalNullable[str]*                    | :heavy_minus_sign:                         | URL to the Stripe-hosted invoice page      |