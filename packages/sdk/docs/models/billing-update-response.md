# BillingUpdateResponse

OK

## Example Usage

```typescript
import { BillingUpdateResponse } from "@useautumn/sdk";

let value: BillingUpdateResponse = {
  customerId: "cus_123",
  invoice: {
    status: "paid",
    stripeId: "in_1234",
    total: 1500,
    currency: "usd",
    hostedInvoiceUrl: "https://invoice.stripe.com/...",
  },
  paymentUrl: null,
};
```

## Fields

| Field                                                                                                                     | Type                                                                                                                      | Required                                                                                                                  | Description                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `customerId`                                                                                                              | *string*                                                                                                                  | :heavy_check_mark:                                                                                                        | The ID of the customer.                                                                                                   |
| `entityId`                                                                                                                | *string*                                                                                                                  | :heavy_minus_sign:                                                                                                        | The ID of the entity, if the plan was attached to an entity.                                                              |
| `invoice`                                                                                                                 | [models.BillingUpdateInvoice](../models/billing-update-invoice.md)                                                        | :heavy_minus_sign:                                                                                                        | Invoice details if an invoice was created. Only present when a charge was made.                                           |
| `paymentUrl`                                                                                                              | *string*                                                                                                                  | :heavy_check_mark:                                                                                                        | URL to redirect the customer to complete payment. Null if no payment action is required.                                  |
| `requiredAction`                                                                                                          | [models.BillingUpdateRequiredAction](../models/billing-update-required-action.md)                                         | :heavy_minus_sign:                                                                                                        | Details about any action required to complete the payment. Present when the payment could not be processed automatically. |