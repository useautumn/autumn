# PlanReset

## Example Usage

```typescript
import { PlanReset } from "@useautumn/sdk";

let value: PlanReset = {
  interval: "one_off",
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval`                                                                                                                                           | [models.PlanResetInterval](../models/plan-reset-interval.md)                                                                                         | :heavy_check_mark:                                                                                                                                   | The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored. |
| `intervalCount`                                                                                                                                      | *number*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                   | Number of intervals between resets. Defaults to 1.                                                                                                   |