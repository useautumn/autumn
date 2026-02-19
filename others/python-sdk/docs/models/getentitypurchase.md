# GetEntityPurchase


## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `plan`                                                            | [Optional[models.Plan]](../models/plan.md)                        | :heavy_minus_sign:                                                | N/A                                                               |
| `plan_id`                                                         | *str*                                                             | :heavy_check_mark:                                                | The unique identifier of the purchased plan.                      |
| `expires_at`                                                      | *Nullable[float]*                                                 | :heavy_check_mark:                                                | Timestamp when the purchase expires, or null for lifetime access. |
| `started_at`                                                      | *float*                                                           | :heavy_check_mark:                                                | Timestamp when the purchase was made.                             |
| `quantity`                                                        | *float*                                                           | :heavy_check_mark:                                                | Number of units purchased.                                        |