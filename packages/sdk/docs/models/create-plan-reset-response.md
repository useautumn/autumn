# CreatePlanResetResponse

## Example Usage

```typescript
import { CreatePlanResetResponse } from "@useautumn/sdk";

let value: CreatePlanResetResponse = {
  interval: "quarter",
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval`                                                                                                                                           | [models.CreatePlanResetIntervalResponse](../models/create-plan-reset-interval-response.md)                                                           | :heavy_check_mark:                                                                                                                                   | The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored. |
| `intervalCount`                                                                                                                                      | *number*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                   | Number of intervals between resets. Defaults to 1.                                                                                                   |