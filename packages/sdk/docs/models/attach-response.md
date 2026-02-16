# AttachResponse

OK

## Example Usage

```typescript
import { AttachResponse } from "@useautumn/sdk";

let value: AttachResponse = {
  customerId: "<id>",
  paymentUrl: "https://outlying-procurement.net",
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `customerId`                                          | *string*                                              | :heavy_check_mark:                                    | N/A                                                   |
| `entityId`                                            | *string*                                              | :heavy_minus_sign:                                    | N/A                                                   |
| `invoice`                                             | [models.AttachInvoice](../models/attach-invoice.md)   | :heavy_minus_sign:                                    | N/A                                                   |
| `paymentUrl`                                          | *string*                                              | :heavy_check_mark:                                    | N/A                                                   |
| `requiredAction`                                      | [models.RequiredAction](../models/required-action.md) | :heavy_minus_sign:                                    | N/A                                                   |