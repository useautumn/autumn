# ListPlansReset

## Example Usage

```typescript
import { ListPlansReset } from "@useautumn/sdk";

let value: ListPlansReset = {
  interval: "semi_annual",
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval`                                                                                                                                           | [models.ListPlansResetInterval](../models/list-plans-reset-interval.md)                                                                              | :heavy_check_mark:                                                                                                                                   | The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored. |
| `intervalCount`                                                                                                                                      | *number*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                   | Number of intervals between resets. Defaults to 1.                                                                                                   |