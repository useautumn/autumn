# PreviewUpdateProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.

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
| `onIncrease`                                                              | [models.PreviewUpdateOnIncrease](../models/preview-update-on-increase.md) | :heavy_check_mark:                                                        | Billing behavior when quantity increases mid-cycle.                       |
| `onDecrease`                                                              | [models.PreviewUpdateOnDecrease](../models/preview-update-on-decrease.md) | :heavy_check_mark:                                                        | Credit behavior when quantity decreases mid-cycle.                        |