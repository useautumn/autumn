# CreatePlanResetRequest

Reset configuration for consumable features. Omit for non-consumable features like seats.


## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `interval`                                                                             | [models.CreatePlanResetIntervalRequest](../models/createplanresetintervalrequest.md)   | :heavy_check_mark:                                                                     | Interval at which balance resets (e.g. 'month', 'year'). For consumable features only. |
| `interval_count`                                                                       | *Optional[float]*                                                                      | :heavy_minus_sign:                                                                     | Number of intervals between resets. Defaults to 1.                                     |