# ListEventsList


## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                                                             | *str*                                                            | :heavy_check_mark:                                               | Event ID (KSUID)                                                 |
| `timestamp`                                                      | *float*                                                          | :heavy_check_mark:                                               | Event timestamp (epoch milliseconds)                             |
| `feature_id`                                                     | *str*                                                            | :heavy_check_mark:                                               | ID of the feature that the event belongs to                      |
| `customer_id`                                                    | *str*                                                            | :heavy_check_mark:                                               | Customer identifier                                              |
| `value`                                                          | *float*                                                          | :heavy_check_mark:                                               | Event value/count                                                |
| `properties`                                                     | [models.ListEventsProperties](../models/listeventsproperties.md) | :heavy_check_mark:                                               | Event properties (JSONB)                                         |