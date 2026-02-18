# BillingAttachResponse

OK

## Example Usage

```typescript
import { BillingAttachResponse } from "@useautumn/sdk";

let value: BillingAttachResponse = {
  customerId: "<id>",
  paymentUrl: "https://shy-stock.com/",
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `customerId`                                                                      | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `entityId`                                                                        | *string*                                                                          | :heavy_minus_sign:                                                                | N/A                                                                               |
| `invoice`                                                                         | [models.BillingAttachInvoice](../models/billing-attach-invoice.md)                | :heavy_minus_sign:                                                                | N/A                                                                               |
| `paymentUrl`                                                                      | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `requiredAction`                                                                  | [models.BillingAttachRequiredAction](../models/billing-attach-required-action.md) | :heavy_minus_sign:                                                                | N/A                                                                               |