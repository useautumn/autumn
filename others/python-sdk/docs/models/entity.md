# Entity


## Fields

| Field                                      | Type                                       | Required                                   | Description                                |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `name`                                     | *Nullable[str]*                            | :heavy_check_mark:                         | The name of the entity                     |
| `customer_id`                              | *OptionalNullable[str]*                    | :heavy_minus_sign:                         | The customer ID this entity belongs to     |
| `feature_id`                               | *OptionalNullable[str]*                    | :heavy_minus_sign:                         | The feature ID this entity belongs to      |
| `env`                                      | [models.EntityEnv](../models/entityenv.md) | :heavy_check_mark:                         | The environment (sandbox/live)             |