# BillingUpdateResponse

OK

## Example Usage

```typescript
import { BillingUpdateResponse } from "@useautumn/sdk";

let value: BillingUpdateResponse = {
  customerId: "<id>",
  paymentUrl: "https://cavernous-folklore.net/",
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `customerId`                                                                      | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `entityId`                                                                        | *string*                                                                          | :heavy_minus_sign:                                                                | N/A                                                                               |
| `invoice`                                                                         | [models.BillingUpdateInvoice](../models/billing-update-invoice.md)                | :heavy_minus_sign:                                                                | N/A                                                                               |
| `paymentUrl`                                                                      | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |
| `requiredAction`                                                                  | [models.BillingUpdateRequiredAction](../models/billing-update-required-action.md) | :heavy_minus_sign:                                                                | N/A                                                                               |