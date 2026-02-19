# DeletePlanParams


## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `plan_id`                                                                              | *str*                                                                                  | :heavy_check_mark:                                                                     | The ID of the plan to delete.                                                          |
| `all_versions`                                                                         | *Optional[bool]*                                                                       | :heavy_minus_sign:                                                                     | If true, deletes all versions of the plan. Otherwise, only deletes the latest version. |