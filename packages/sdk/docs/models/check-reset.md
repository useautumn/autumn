# CheckReset

## Example Usage

```typescript
import { CheckReset } from "@useautumn/sdk";

let value: CheckReset = {
  interval: "one_off",
  resetsAt: 5013.88,
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `interval`                                                                                            | *models.CheckIntervalUnion*                                                                           | :heavy_check_mark:                                                                                    | The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals. |
| `intervalCount`                                                                                       | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of intervals between resets (eg. 2 for bi-monthly).                                            |
| `resetsAt`                                                                                            | *number*                                                                                              | :heavy_check_mark:                                                                                    | Timestamp when the balance will next reset.                                                           |