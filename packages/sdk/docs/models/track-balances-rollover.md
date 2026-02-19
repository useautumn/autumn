# TrackBalancesRollover

## Example Usage

```typescript
import { TrackBalancesRollover } from "@useautumn/sdk";

let value: TrackBalancesRollover = {
  balance: 7020.23,
  expiresAt: 7231.7,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |