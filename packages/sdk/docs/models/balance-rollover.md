# BalanceRollover

## Example Usage

```typescript
import { BalanceRollover } from "@useautumn/sdk";

let value: BalanceRollover = {
  balance: 196.64,
  expiresAt: 6073.27,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |