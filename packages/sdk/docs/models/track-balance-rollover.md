# TrackBalanceRollover

## Example Usage

```typescript
import { TrackBalanceRollover } from "@useautumn/sdk";

let value: TrackBalanceRollover = {
  balance: 1633.78,
  expiresAt: 1333.49,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |