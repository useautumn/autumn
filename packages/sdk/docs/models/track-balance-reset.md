# TrackBalanceReset

## Example Usage

```typescript
import { TrackBalanceReset } from "@useautumn/sdk";

let value: TrackBalanceReset = {
  interval: "quarter",
  resetsAt: 9499.19,
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `interval`                                                                                            | *models.TrackBalanceIntervalUnion*                                                                    | :heavy_check_mark:                                                                                    | The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals. |
| `intervalCount`                                                                                       | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of intervals between resets (eg. 2 for bi-monthly).                                            |
| `resetsAt`                                                                                            | *number*                                                                                              | :heavy_check_mark:                                                                                    | Timestamp when the balance will next reset.                                                           |