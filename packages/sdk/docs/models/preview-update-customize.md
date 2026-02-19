# PreviewUpdateCustomize

Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both.

## Example Usage

```typescript
import { PreviewUpdateCustomize } from "@useautumn/sdk";

let value: PreviewUpdateCustomize = {};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `price`                                                        | [models.PreviewUpdatePrice](../models/preview-update-price.md) | :heavy_minus_sign:                                             | N/A                                                            |
| `items`                                                        | [models.PreviewUpdateItem](../models/preview-update-item.md)[] | :heavy_minus_sign:                                             | N/A                                                            |