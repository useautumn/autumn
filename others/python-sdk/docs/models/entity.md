# Entity


## Fields

| Field                                      | Type                                       | Required                                   | Description                                |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `autumn_id`                                | *Optional[str]*                            | :heavy_minus_sign:                         | N/A                                        |
| `id`                                       | *Nullable[str]*                            | :heavy_check_mark:                         | The unique identifier of the entity        |
| `name`                                     | *Nullable[str]*                            | :heavy_check_mark:                         | The name of the entity                     |
| `customer_id`                              | *OptionalNullable[str]*                    | :heavy_minus_sign:                         | The customer ID this entity belongs to     |
| `feature_id`                               | *OptionalNullable[str]*                    | :heavy_minus_sign:                         | The feature ID this entity belongs to      |
| `created_at`                               | *float*                                    | :heavy_check_mark:                         | Unix timestamp when the entity was created |
| `env`                                      | [models.EntityEnv](../models/entityenv.md) | :heavy_check_mark:                         | The environment (sandbox/live)             |