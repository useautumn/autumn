# PreviewUpdateReset

Reset configuration for consumable features. Omit for non-consumable features like seats.

## Example Usage

```typescript
import { PreviewUpdateReset } from "@useautumn/sdk";

let value: PreviewUpdateReset = {
  interval: "minute",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `interval`                                                                             | [models.PreviewUpdateResetInterval](../models/preview-update-reset-interval.md)        | :heavy_check_mark:                                                                     | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only. |
| `intervalCount`                                                                        | *number*                                                                               | :heavy_minus_sign:                                                                     | Number of intervals between resets. Defaults to 1.                                     |