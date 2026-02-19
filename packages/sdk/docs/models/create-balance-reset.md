# CreateBalanceReset

Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.

## Example Usage

```typescript
import { CreateBalanceReset } from "@useautumn/sdk";

let value: CreateBalanceReset = {
  interval: "year",
};
```

## Fields

| Field                                                                                                                     | Type                                                                                                                      | Required                                                                                                                  | Description                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `interval`                                                                                                                | [models.CreateBalanceInterval](../models/create-balance-interval.md)                                                      | :heavy_check_mark:                                                                                                        | The interval at which the balance resets (e.g., 'month', 'day', 'year').                                                  |
| `intervalCount`                                                                                                           | *number*                                                                                                                  | :heavy_minus_sign:                                                                                                        | Number of intervals between resets. Defaults to 1 (e.g., interval_count: 2 with interval: 'month' resets every 2 months). |