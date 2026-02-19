# BillingAttachInvoiceMode

Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.

## Example Usage

```typescript
import { BillingAttachInvoiceMode } from "@useautumn/sdk";

let value: BillingAttachInvoiceMode = {
  enabled: false,
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                                                                                                                                            | *boolean*                                                                                                                                            | :heavy_check_mark:                                                                                                                                   | When true, creates an invoice and sends it to the customer instead of charging their card immediately. Uses Stripe's send_invoice collection method. |
| `enablePlanImmediately`                                                                                                                              | *boolean*                                                                                                                                            | :heavy_minus_sign:                                                                                                                                   | If true, enables the plan immediately even though the invoice is not paid yet.                                                                       |
| `finalize`                                                                                                                                           | *boolean*                                                                                                                                            | :heavy_minus_sign:                                                                                                                                   | If true, finalizes the invoice so it can be sent to the customer. If false, keeps it as a draft for manual review.                                   |