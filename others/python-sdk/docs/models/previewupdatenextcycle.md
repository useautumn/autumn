# PreviewUpdateNextCycle

Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.


## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `starts_at`                                                       | *float*                                                           | :heavy_check_mark:                                                | Unix timestamp (milliseconds) when the next billing cycle starts. |
| `total`                                                           | *float*                                                           | :heavy_check_mark:                                                | The total amount in cents for the next cycle.                     |