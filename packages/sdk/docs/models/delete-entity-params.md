# DeleteEntityParams

## Example Usage

```typescript
import { DeleteEntityParams } from "@useautumn/sdk";

let value: DeleteEntityParams = {
  customerId: "cus_123",
  entityId: "seat_42",
};
```

## Fields

| Field                   | Type                    | Required                | Description             |
| ----------------------- | ----------------------- | ----------------------- | ----------------------- |
| `customerId`            | *string*                | :heavy_minus_sign:      | The ID of the customer. |
| `entityId`              | *string*                | :heavy_check_mark:      | The ID of the entity.   |