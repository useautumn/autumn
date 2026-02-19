# CheckBalanceRollover

## Example Usage

```typescript
import { CheckBalanceRollover } from "@useautumn/sdk";

let value: CheckBalanceRollover = {
  balance: 9280.93,
  expiresAt: 5290.45,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |