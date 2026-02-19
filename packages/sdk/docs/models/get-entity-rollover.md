# GetEntityRollover

## Example Usage

```typescript
import { GetEntityRollover } from "@useautumn/sdk";

let value: GetEntityRollover = {
  balance: 9974.52,
  expiresAt: 6340.52,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |