# CreateEntityParams


## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `name`                                                     | *OptionalNullable[str]*                                    | :heavy_minus_sign:                                         | The name of the entity                                     |
| `feature_id`                                               | *str*                                                      | :heavy_check_mark:                                         | The ID of the feature this entity is associated with       |
| `customer_data`                                            | [Optional[models.CustomerData]](../models/customerdata.md) | :heavy_minus_sign:                                         | Customer details to set when creating a customer           |
| `customer_id`                                              | *str*                                                      | :heavy_check_mark:                                         | The ID of the customer to create the entity for.           |
| `entity_id`                                                | *str*                                                      | :heavy_check_mark:                                         | The ID of the entity.                                      |