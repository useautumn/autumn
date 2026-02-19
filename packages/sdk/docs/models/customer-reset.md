# CustomerReset

## Example Usage

```typescript
import { CustomerReset } from "@useautumn/sdk";

let value: CustomerReset = {
  interval: "day",
  resetsAt: 81.85,
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `interval`                                                                                            | *models.CustomerIntervalUnion*                                                                        | :heavy_check_mark:                                                                                    | The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals. |
| `intervalCount`                                                                                       | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of intervals between resets (eg. 2 for bi-monthly).                                            |
| `resetsAt`                                                                                            | *number*                                                                                              | :heavy_check_mark:                                                                                    | Timestamp when the balance will next reset.                                                           |