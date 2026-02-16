# Entity

## Example Usage

```typescript
import { Entity } from "@useautumn/sdk";

let value: Entity = {
  id: "<id>",
  name: "<value>",
  createdAt: 4436.47,
  env: "sandbox",
};
```

## Fields

| Field                                       | Type                                        | Required                                    | Description                                 |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `autumnId`                                  | *string*                                    | :heavy_minus_sign:                          | N/A                                         |
| `id`                                        | *string*                                    | :heavy_check_mark:                          | The unique identifier of the entity         |
| `name`                                      | *string*                                    | :heavy_check_mark:                          | The name of the entity                      |
| `customerId`                                | *string*                                    | :heavy_minus_sign:                          | The customer ID this entity belongs to      |
| `featureId`                                 | *string*                                    | :heavy_minus_sign:                          | The feature ID this entity belongs to       |
| `createdAt`                                 | *number*                                    | :heavy_check_mark:                          | Unix timestamp when the entity was created  |
| `env`                                       | [models.EntityEnv](../models/entity-env.md) | :heavy_check_mark:                          | The environment (sandbox/live)              |