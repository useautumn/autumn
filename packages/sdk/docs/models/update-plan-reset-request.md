# UpdatePlanResetRequest

Reset configuration for consumable features. Omit for non-consumable features like seats.

## Example Usage

```typescript
import { UpdatePlanResetRequest } from "@useautumn/sdk";

let value: UpdatePlanResetRequest = {
  interval: "one_off",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `interval`                                                                               | [models.UpdatePlanResetIntervalRequest](../models/update-plan-reset-interval-request.md) | :heavy_check_mark:                                                                       | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.   |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of intervals between resets. Defaults to 1.                                       |