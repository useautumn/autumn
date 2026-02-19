# ListCustomersRollover

## Example Usage

```typescript
import { ListCustomersRollover } from "@useautumn/sdk";

let value: ListCustomersRollover = {
  balance: 8547.28,
  expiresAt: 9955.79,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |