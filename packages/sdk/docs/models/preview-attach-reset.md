# PreviewAttachReset

Reset configuration for consumable features. Omit for non-consumable features like seats.

## Example Usage

```typescript
import { PreviewAttachReset } from "@useautumn/sdk";

let value: PreviewAttachReset = {
  interval: "day",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `interval`                                                                             | [models.PreviewAttachResetInterval](../models/preview-attach-reset-interval.md)        | :heavy_check_mark:                                                                     | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only. |
| `intervalCount`                                                                        | *number*                                                                               | :heavy_minus_sign:                                                                     | Number of intervals between resets. Defaults to 1.                                     |