# BillingPreviewAttachCustomize

Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both.

## Example Usage

```typescript
import { BillingPreviewAttachCustomize } from "@useautumn/sdk";

let value: BillingPreviewAttachCustomize = {};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `price`                                                                                      | [models.BillingPreviewAttachPriceRequest](../models/billing-preview-attach-price-request.md) | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `items`                                                                                      | [models.BillingPreviewAttachItem](../models/billing-preview-attach-item.md)[]                | :heavy_minus_sign:                                                                           | N/A                                                                                          |