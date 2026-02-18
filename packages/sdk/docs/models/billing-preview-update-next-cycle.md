# BillingPreviewUpdateNextCycle

## Example Usage

```typescript
import { BillingPreviewUpdateNextCycle } from "@useautumn/sdk";

let value: BillingPreviewUpdateNextCycle = {
  startsAt: 5213.81,
  total: 8156.95,
  lineItems: [
    {
      title: "<value>",
      description: "given gratefully whoever",
      amount: 5703.35,
      planId: "<id>",
      totalQuantity: 3085.48,
      paidQuantity: 8080.87,
    },
  ],
};
```

## Fields

| Field                                                                                                      | Type                                                                                                       | Required                                                                                                   | Description                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `startsAt`                                                                                                 | *number*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `total`                                                                                                    | *number*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `lineItems`                                                                                                | [models.BillingPreviewUpdateNextCycleLineItem](../models/billing-preview-update-next-cycle-line-item.md)[] | :heavy_check_mark:                                                                                         | N/A                                                                                                        |