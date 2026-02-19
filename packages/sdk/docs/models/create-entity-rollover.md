# CreateEntityRollover

## Example Usage

```typescript
import { CreateEntityRollover } from "@useautumn/sdk";

let value: CreateEntityRollover = {
  balance: 3028.79,
  expiresAt: 9861.8,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |