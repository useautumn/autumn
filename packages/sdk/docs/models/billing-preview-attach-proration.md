# BillingPreviewAttachProration

## Example Usage

```typescript
import { BillingPreviewAttachProration } from "@useautumn/sdk";

let value: BillingPreviewAttachProration = {
  onIncrease: "bill_immediately",
  onDecrease: "no_prorations",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `onIncrease`                                                                             | [models.BillingPreviewAttachOnIncrease](../models/billing-preview-attach-on-increase.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `onDecrease`                                                                             | [models.BillingPreviewAttachOnDecrease](../models/billing-preview-attach-on-decrease.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |