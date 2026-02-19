# GetEntityParams

## Example Usage

```typescript
import { GetEntityParams } from "@useautumn/sdk";

let value: GetEntityParams = {
  entityId: "seat_42",
};
```

## Fields

| Field                                            | Type                                             | Required                                         | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| `customerId`                                     | *string*                                         | :heavy_minus_sign:                               | The ID of the customer to create the entity for. |
| `entityId`                                       | *string*                                         | :heavy_check_mark:                               | The ID of the entity.                            |