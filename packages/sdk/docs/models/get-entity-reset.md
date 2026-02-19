# GetEntityReset

## Example Usage

```typescript
import { GetEntityReset } from "@useautumn/sdk";

let value: GetEntityReset = {
  interval: "<value>",
  resetsAt: null,
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `interval`                                                                                            | *models.GetEntityIntervalUnion*                                                                       | :heavy_check_mark:                                                                                    | The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals. |
| `intervalCount`                                                                                       | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of intervals between resets (eg. 2 for bi-monthly).                                            |
| `resetsAt`                                                                                            | *number*                                                                                              | :heavy_check_mark:                                                                                    | Timestamp when the balance will next reset.                                                           |