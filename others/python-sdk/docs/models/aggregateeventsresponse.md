# AggregateEventsResponse

OK


## Fields

| Field                                                                               | Type                                                                                | Required                                                                            | Description                                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `list`                                                                              | List[[models.AggregateEventsList](../models/aggregateeventslist.md)]                | :heavy_check_mark:                                                                  | Array of time periods with aggregated values                                        |
| `total`                                                                             | Dict[str, [models.Total](../models/total.md)]                                       | :heavy_check_mark:                                                                  | Total aggregations per feature. Keys are feature IDs, values contain count and sum. |