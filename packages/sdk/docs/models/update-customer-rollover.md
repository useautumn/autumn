# UpdateCustomerRollover

## Example Usage

```typescript
import { UpdateCustomerRollover } from "@useautumn/sdk";

let value: UpdateCustomerRollover = {
  balance: 7797.12,
  expiresAt: 297.95,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |