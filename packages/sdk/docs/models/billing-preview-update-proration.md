# BillingPreviewUpdateProration

## Example Usage

```typescript
import { BillingPreviewUpdateProration } from "@useautumn/sdk";

let value: BillingPreviewUpdateProration = {
  onIncrease: "bill_next_cycle",
  onDecrease: "no_prorations",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `onIncrease`                                                                             | [models.BillingPreviewUpdateOnIncrease](../models/billing-preview-update-on-increase.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `onDecrease`                                                                             | [models.BillingPreviewUpdateOnDecrease](../models/billing-preview-update-on-decrease.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |