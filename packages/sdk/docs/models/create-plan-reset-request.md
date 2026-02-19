# CreatePlanResetRequest

Reset configuration for consumable features. Omit for non-consumable features like seats.

## Example Usage

```typescript
import { CreatePlanResetRequest } from "@useautumn/sdk";

let value: CreatePlanResetRequest = {
  interval: "semi_annual",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `interval`                                                                               | [models.CreatePlanResetIntervalRequest](../models/create-plan-reset-interval-request.md) | :heavy_check_mark:                                                                       | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.   |
| `intervalCount`                                                                          | *number*                                                                                 | :heavy_minus_sign:                                                                       | Number of intervals between resets. Defaults to 1.                                       |