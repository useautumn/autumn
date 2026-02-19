# CustomerRollover

## Example Usage

```typescript
import { CustomerRollover } from "@useautumn/sdk";

let value: CustomerRollover = {
  balance: 2293.39,
  expiresAt: 9458.8,
};
```

## Fields

| Field                                                 | Type                                                  | Required                                              | Description                                           |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `balance`                                             | *number*                                              | :heavy_check_mark:                                    | Amount of balance rolled over from a previous period. |
| `expiresAt`                                           | *number*                                              | :heavy_check_mark:                                    | Timestamp when the rollover balance expires.          |