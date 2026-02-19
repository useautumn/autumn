# PreviewUpdateProration

## Example Usage

```typescript
import { PreviewUpdateProration } from "@useautumn/sdk";

let value: PreviewUpdateProration = {
  onIncrease: "bill_immediately",
  onDecrease: "no_prorations",
};
```

## Fields

| Field                                                                     | Type                                                                      | Required                                                                  | Description                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `onIncrease`                                                              | [models.PreviewUpdateOnIncrease](../models/preview-update-on-increase.md) | :heavy_check_mark:                                                        | N/A                                                                       |
| `onDecrease`                                                              | [models.PreviewUpdateOnDecrease](../models/preview-update-on-decrease.md) | :heavy_check_mark:                                                        | N/A                                                                       |