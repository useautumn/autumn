# BillingPreviewUpdateResponse

OK

## Example Usage

```typescript
import { BillingPreviewUpdateResponse } from "@useautumn/sdk";

let value: BillingPreviewUpdateResponse = {
  customerId: "<id>",
  lineItems: [],
  total: 1183.22,
  currency: "Pa'anga",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `customerId`                                                                           | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `lineItems`                                                                            | [models.BillingPreviewUpdateLineItem](../models/billing-preview-update-line-item.md)[] | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `total`                                                                                | *number*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `currency`                                                                             | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `periodStart`                                                                          | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `periodEnd`                                                                            | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `credit`                                                                               | [models.BillingPreviewUpdateCredit](../models/billing-preview-update-credit.md)        | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `nextCycle`                                                                            | [models.BillingPreviewUpdateNextCycle](../models/billing-preview-update-next-cycle.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |