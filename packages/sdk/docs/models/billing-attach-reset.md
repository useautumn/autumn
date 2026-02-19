# BillingAttachReset

Reset configuration for consumable features. Omit for non-consumable features like seats.

## Example Usage

```typescript
import { BillingAttachReset } from "@useautumn/sdk";

let value: BillingAttachReset = {
  interval: "year",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `interval`                                                                             | [models.BillingAttachResetInterval](../models/billing-attach-reset-interval.md)        | :heavy_check_mark:                                                                     | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only. |
| `intervalCount`                                                                        | *number*                                                                               | :heavy_minus_sign:                                                                     | Number of intervals between resets. Defaults to 1.                                     |