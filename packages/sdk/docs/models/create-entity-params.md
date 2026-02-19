# CreateEntityParams

## Example Usage

```typescript
import { CreateEntityParams } from "@useautumn/sdk";

let value: CreateEntityParams = {
  name: "Seat 42",
  featureId: "seats",
  customerId: "cus_123",
  entityId: "seat_42",
};
```

## Fields

| Field                                                | Type                                                 | Required                                             | Description                                          |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `name`                                               | *string*                                             | :heavy_minus_sign:                                   | The name of the entity                               |
| `featureId`                                          | *string*                                             | :heavy_check_mark:                                   | The ID of the feature this entity is associated with |
| `customerData`                                       | [models.CustomerData](../models/customer-data.md)    | :heavy_minus_sign:                                   | Customer details to set when creating a customer     |
| `customerId`                                         | *string*                                             | :heavy_check_mark:                                   | The ID of the customer to create the entity for.     |
| `entityId`                                           | *string*                                             | :heavy_check_mark:                                   | The ID of the entity.                                |