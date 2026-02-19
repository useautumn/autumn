# PreviewAttachCustomize

Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both.

## Example Usage

```typescript
import { PreviewAttachCustomize } from "@useautumn/sdk";

let value: PreviewAttachCustomize = {};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `price`                                                        | [models.PreviewAttachPrice](../models/preview-attach-price.md) | :heavy_minus_sign:                                             | N/A                                                            |
| `items`                                                        | [models.PreviewAttachItem](../models/preview-attach-item.md)[] | :heavy_minus_sign:                                             | N/A                                                            |