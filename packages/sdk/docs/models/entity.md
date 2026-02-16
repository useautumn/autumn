# Entity

## Example Usage

```typescript
import { Entity } from "@useautumn/sdk";

let value: Entity = {
  name: "<value>",
  env: "sandbox",
};
```

## Fields

| Field                                       | Type                                        | Required                                    | Description                                 |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `name`                                      | *string*                                    | :heavy_check_mark:                          | The name of the entity                      |
| `customerId`                                | *string*                                    | :heavy_minus_sign:                          | The customer ID this entity belongs to      |
| `featureId`                                 | *string*                                    | :heavy_minus_sign:                          | The feature ID this entity belongs to       |
| `env`                                       | [models.EntityEnv](../models/entity-env.md) | :heavy_check_mark:                          | The environment (sandbox/live)              |